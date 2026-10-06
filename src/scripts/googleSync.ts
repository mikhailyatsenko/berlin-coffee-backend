import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config/config.js";
import Place, { BusinessStatus, IOpeningHour } from "../models/Place.js";

/**
 * The Google sync as a module, one function per subcommand of
 * syncGooglePlaces.ts. Works on an already-open mongoose connection.
 *
 * `plan` looks Places up in the Google Places API (New) by their Google Place
 * ID and writes a Sync plan: one entry per field Google would change. It
 * writes nothing to Places. Every lookup is billed.
 *
 * Google only proposes a field when it returns a value, so data entered by
 * hand is never wiped. Name, address and location are never taken from
 * Google: ours are formatted differently on purpose.
 *
 * Full guide, costs and pitfalls: docs/google-places-sync.md
 */

const CONCURRENCY = 3;

const FIELD_MASK = [
  "id",
  "businessStatus",
  "regularOpeningHours.weekdayDescriptions",
  "internationalPhoneNumber",
  "websiteUri",
].join(",");
/** Bump when FIELD_MASK changes, so plans made with another mask can be told apart. */
const FIELD_MASK_VERSION = 1;

interface GooglePlace {
  id: string;
  businessStatus?: BusinessStatus;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  internationalPhoneNumber?: string;
  websiteUri?: string;
}

type FetchResult =
  | { status: "ok"; place: GooglePlace }
  | { status: "not_found" }
  | { status: "error"; message: string };

export type SyncField = "businessStatus" | "googleId" | "openingHours" | "phone" | "website";

export interface SyncChange {
  field: SyncField;
  current: unknown;
  proposed: unknown;
}

export interface SyncPlan {
  meta: {
    createdAt: string;
    database: DatabaseIdentity;
    lookedUp: number;
    limit: number | null;
    fieldMaskVersion: number;
  };
  places: { placeId: string; name: string; changes: SyncChange[] }[];
  notFound: { placeId: string; name: string; googleId: string }[];
  failed: { placeId: string; name: string; reason: string }[];
}

export interface DatabaseIdentity {
  host: string;
  name: string;
}

/**
 * Host and database name from a Mongo connection string, never credentials.
 * Not parsed with URL: a replica set lists several comma-separated hosts.
 */
export const databaseIdentity = (uri: string): DatabaseIdentity => {
  const [authority, ...rest] = uri.replace(/^mongodb(\+srv)?:\/\//, "").split("/");
  return {
    host: authority.slice(authority.lastIndexOf("@") + 1),
    name: rest.join("/").split("?")[0],
  };
};

const fetchPlace = async (googleId: string): Promise<FetchResult> => {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${googleId}?languageCode=en`,
    {
      headers: {
        "X-Goog-Api-Key": config.googlePlacesApiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
    },
  );

  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) {
    return { status: "error", message: `${response.status} ${await response.text()}` };
  }
  return { status: "ok", place: (await response.json()) as GooglePlace };
};

// "Monday: 9:00 AM – 5:30 PM" -> { day: "Monday", hours: "9 AM to 5:30 PM" },
// matching the format already stored in the database.
// Google puts narrow no-break spaces before AM/PM; stored data has them too.
const normalizeSpaces = (value: string) => value.replace(/[\u202f\u2009\u00a0]/g, " ");

const toOpeningHours = (descriptions: string[]): IOpeningHour[] =>
  descriptions.map((line) => {
    const normalized = normalizeSpaces(line);
    const separator = normalized.indexOf(": ");
    return {
      day: normalized.slice(0, separator),
      hours: normalized
        .slice(separator + 2)
        .replace(/\s*[–-]\s*/g, " to ")
        .replace(/:00\b/g, ""),
    };
  });

// Stored hours as plain { day, hours }, without what mongoose adds.
const plainHours = (stored: IOpeningHour[] = []) => stored.map(({ day, hours }) => ({ day, hours }));

const sameHours = (stored: IOpeningHour[] | undefined, fresh: IOpeningHour[]) =>
  JSON.stringify(plainHours(stored).map(({ day, hours }) => ({ day, hours: normalizeSpaces(hours) }))) ===
  JSON.stringify(fresh);

const runPool = async <T>(items: T[], worker: (item: T) => Promise<void>) => {
  let next = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
};

type StoredPlace = {
  businessStatus?: BusinessStatus;
  googleId?: string | null;
  openingHours?: IOpeningHour[];
  phone?: string | null;
  website?: string | null;
};

/** What Google would change on one Place, field by field, in a fixed order. */
const changesFor = (stored: StoredPlace, google: GooglePlace): SyncChange[] => {
  const changes: SyncChange[] = [];

  const storedStatus = stored.businessStatus ?? "OPERATIONAL";
  if (google.businessStatus && google.businessStatus !== storedStatus) {
    changes.push({ field: "businessStatus", current: storedStatus, proposed: google.businessStatus });
  }

  // Google may migrate a place to a new ID; keep ours current.
  if (google.id && google.id !== stored.googleId) {
    changes.push({ field: "googleId", current: stored.googleId, proposed: google.id });
  }

  const descriptions = google.regularOpeningHours?.weekdayDescriptions;
  if (descriptions?.length) {
    const hours = toOpeningHours(descriptions);
    if (!sameHours(stored.openingHours, hours)) {
      changes.push({ field: "openingHours", current: plainHours(stored.openingHours), proposed: hours });
    }
  }

  if (google.internationalPhoneNumber && google.internationalPhoneNumber !== stored.phone) {
    changes.push({ field: "phone", current: stored.phone ?? null, proposed: google.internationalPhoneNumber });
  }

  if (google.websiteUri && google.websiteUri !== stored.website) {
    changes.push({ field: "website", current: stored.website ?? null, proposed: google.websiteUri });
  }

  return changes;
};

// 2026-10-06T12:34:56.789Z -> 2026-10-06T12-34-56Z: sortable, and safe in file names.
const fileStamp = (now: Date) => now.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");

/**
 * Looks up every Place with a Google Place ID (the first `limit` by `_id`, if
 * given) and writes `<datetime>-plan.json` into `dir`. Writes nothing to Places.
 */
export async function plan({ limit, dir, now }: { limit?: number; dir: string; now: Date }) {
  const places = await Place.find({ "properties.googleId": { $nin: [null, ""] } })
    .sort({ _id: 1 })
    .limit(limit ?? 0)
    .lean();

  const order = new Map(places.map((place, index) => [place._id.toString(), index]));
  const byId = <T extends { placeId: string }>(a: T, b: T) =>
    order.get(a.placeId)! - order.get(b.placeId)!;

  const result: SyncPlan = {
    meta: {
      createdAt: now.toISOString(),
      database: databaseIdentity(config.mongoUri),
      lookedUp: places.length,
      limit: limit || null,
      fieldMaskVersion: FIELD_MASK_VERSION,
    },
    places: [],
    notFound: [],
    failed: [],
  };

  await runPool(places, async (place) => {
    const placeId = place._id.toString();
    const { name, googleId } = place.properties;

    let fetched: FetchResult;
    try {
      fetched = await fetchPlace(googleId!);
    } catch (error) {
      fetched = { status: "error", message: (error as Error).message };
    }

    if (fetched.status === "not_found") {
      result.notFound.push({ placeId, name, googleId: googleId! });
    } else if (fetched.status === "error") {
      result.failed.push({ placeId, name, reason: fetched.message });
    } else {
      const changes = changesFor(place.properties, fetched.place);
      if (changes.length) result.places.push({ placeId, name, changes });
    }
  });

  // The pool finishes Places out of order; the file lists them by `_id`.
  result.places.sort(byId);
  result.notFound.sort(byId);
  result.failed.sort(byId);

  await mkdir(dir, { recursive: true });
  const planPath = path.join(dir, `${fileStamp(now)}-plan.json`);
  await writeFile(planPath, `${JSON.stringify(result, null, 2)}\n`);

  return { path: planPath, syncPlan: result };
}
