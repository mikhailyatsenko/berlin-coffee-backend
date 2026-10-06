import { mkdir, readFile, writeFile } from "node:fs/promises";
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
 * `apply` writes what is left in a reviewed Sync plan to Places, never over a
 * field edited since the plan was made, and records an Applied sync. It sends
 * nothing to Google.
 *
 * `rollback` writes an Applied sync's previous values back to Places, never
 * over a field edited since the apply. It sends nothing to Google.
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

const SYNC_FIELDS: readonly SyncField[] = ["businessStatus", "googleId", "openingHours", "phone", "website"];
const STALE_PLAN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Refusal: the file was made from another database than the connected one. Nothing is written. */
export class DatabaseMismatchError extends Error {
  constructor(
    readonly file: DatabaseIdentity,
    readonly connected: DatabaseIdentity,
  ) {
    super(
      `The file was made from database ${file?.name} on ${file?.host}, but this is ${connected.name} on ${connected.host}. Nothing was written.`,
    );
    this.name = "DatabaseMismatchError";
  }
}

export type SkipReason = "already applied" | "changed since plan";

export interface AppliedSync {
  meta: {
    plan: string;
    planCreatedAt: string;
    appliedAt: string;
    database: DatabaseIdentity;
  };
  /** Entries written, with `current` as read from the database just before the write. */
  written: { placeId: string; name: string; field: SyncField; current: unknown; proposed: unknown }[];
  skipped: { placeId: string; name: string; field: SyncField; reason: SkipReason }[];
}

// A field's value the way `plan` records it as `current`: a missing status is
// OPERATIONAL, missing strings are null, hours are plain with ordinary spaces.
const comparable = (field: SyncField, value: unknown) => {
  if (field === "businessStatus") return value ?? "OPERATIONAL";
  if (field === "openingHours") {
    return plainHours((value ?? []) as IOpeningHour[]).map(({ day, hours }) => ({
      day,
      hours: normalizeSpaces(hours),
    }));
  }
  return value ?? null;
};

const sameValue = (field: SyncField, a: unknown, b: unknown) =>
  JSON.stringify(comparable(field, a)) === JSON.stringify(comparable(field, b));

const writeJson = (file: string, value: unknown) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Writes what is left in a reviewed Sync plan to Places, entry by entry, and
 * records `<datetime>-applied.json` next to the plan, rewritten after each
 * Place. An entry whose field no longer holds the plan's `current` is skipped.
 */
export async function apply(planPath: string, { now }: { now: Date }) {
  const syncPlan = JSON.parse(await readFile(planPath, "utf8")) as SyncPlan;

  const connected = databaseIdentity(config.mongoUri);
  const { database } = syncPlan.meta;
  if (database?.host !== connected.host || database?.name !== connected.name) {
    throw new DatabaseMismatchError(database, connected);
  }
  // A hand-edited plan must not reach fields the sync doesn't own.
  for (const { name, changes } of syncPlan.places) {
    for (const { field } of changes) {
      if (!SYNC_FIELDS.includes(field)) {
        throw new Error(`Plan entry for ${name} has a field the sync doesn't write: ${field}`);
      }
    }
  }

  const warnings: string[] = [];
  const age = now.getTime() - new Date(syncPlan.meta.createdAt).getTime();
  if (age > STALE_PLAN_DAYS * DAY_MS) {
    warnings.push(
      `The plan is ${Math.floor(age / DAY_MS)} days old (made ${syncPlan.meta.createdAt}); Google's data may have changed since.`,
    );
  }

  const appliedPath = path.join(path.dirname(planPath), `${fileStamp(now)}-applied.json`);
  const appliedSync: AppliedSync = {
    meta: {
      plan: path.basename(planPath),
      planCreatedAt: syncPlan.meta.createdAt,
      appliedAt: now.toISOString(),
      database: syncPlan.meta.database,
    },
    written: [],
    skipped: [],
  };
  await writeJson(appliedPath, appliedSync);

  for (const { placeId, name, changes } of syncPlan.places) {
    if (!changes.length) continue;
    const stored = (await Place.findById(placeId).lean())?.properties as
      | Record<string, unknown>
      | undefined;

    // One compare-and-set per Place: the filter holds every field to write
    // exactly as just read, so an edit landing in between skips them all.
    const filter: Record<string, unknown> = { _id: placeId };
    const update: Record<string, unknown> = {};
    const toWrite: AppliedSync["written"] = [];

    for (const { field, current, proposed } of changes) {
      const value = stored?.[field];
      if (stored && sameValue(field, value, current)) {
        filter[`properties.${field}`] = value === undefined ? { $exists: false } : value;
        update[`properties.${field}`] = proposed;
        toWrite.push({ placeId, name, field, current: comparable(field, value), proposed });
      } else if (stored && sameValue(field, value, proposed)) {
        appliedSync.skipped.push({ placeId, name, field, reason: "already applied" });
      } else {
        appliedSync.skipped.push({ placeId, name, field, reason: "changed since plan" });
      }
    }

    if (toWrite.length) {
      const { matchedCount } = await Place.updateOne(filter, { $set: update });
      if (matchedCount) appliedSync.written.push(...toWrite);
      else {
        for (const { field } of toWrite) {
          appliedSync.skipped.push({ placeId, name, field, reason: "changed since plan" });
        }
      }
    }
    await writeJson(appliedPath, appliedSync);
  }

  return { path: appliedPath, appliedSync, warnings };
}

export interface RollbackResult {
  /** Entries whose field held what `apply` wrote and got `restored` (the Applied sync's `current`) back. */
  restored: { placeId: string; name: string; field: SyncField; restored: unknown; replaced: unknown }[];
  leftAlone: { placeId: string; name: string; field: SyncField; reason: "changed since apply" }[];
}

/**
 * Writes an Applied sync's previous values back to Places. An entry whose
 * field no longer holds what `apply` wrote is left alone and reported.
 * Skipped entries of the Applied sync are ignored. Sends nothing to Google.
 */
export async function rollback(appliedPath: string): Promise<RollbackResult> {
  const appliedSync = JSON.parse(await readFile(appliedPath, "utf8")) as AppliedSync;

  const connected = databaseIdentity(config.mongoUri);
  const { database } = appliedSync.meta;
  if (database?.host !== connected.host || database?.name !== connected.name) {
    throw new DatabaseMismatchError(database, connected);
  }
  // A hand-edited Applied sync must not reach fields the sync doesn't own.
  for (const { name, field } of appliedSync.written) {
    if (!SYNC_FIELDS.includes(field)) {
      throw new Error(`Applied sync entry for ${name} has a field the sync doesn't write: ${field}`);
    }
  }

  // Entries of one Place are rolled back together, in the file's order.
  const byPlace = new Map<string, AppliedSync["written"]>();
  for (const entry of appliedSync.written) {
    byPlace.set(entry.placeId, [...(byPlace.get(entry.placeId) ?? []), entry]);
  }

  const result: RollbackResult = { restored: [], leftAlone: [] };
  for (const [placeId, entries] of byPlace) {
    const stored = (await Place.findById(placeId).lean())?.properties as
      | Record<string, unknown>
      | undefined;

    // One compare-and-set per Place, as in `apply`.
    const filter: Record<string, unknown> = { _id: placeId };
    const update: Record<string, unknown> = {};
    const toRestore: RollbackResult["restored"] = [];

    for (const { name, field, current, proposed } of entries) {
      const value = stored?.[field];
      if (stored && sameValue(field, value, proposed)) {
        filter[`properties.${field}`] = value === undefined ? { $exists: false } : value;
        update[`properties.${field}`] = current;
        toRestore.push({ placeId, name, field, restored: current, replaced: proposed });
      } else {
        result.leftAlone.push({ placeId, name, field, reason: "changed since apply" });
      }
    }

    if (toRestore.length) {
      const { matchedCount } = await Place.updateOne(filter, { $set: update });
      if (matchedCount) result.restored.push(...toRestore);
      else {
        for (const { name, field } of toRestore) {
          result.leftAlone.push({ placeId, name, field, reason: "changed since apply" });
        }
      }
    }
  }

  return result;
}
