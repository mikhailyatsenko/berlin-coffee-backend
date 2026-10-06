import { mkdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { config } from "../config/config.js";
import Place, { BusinessStatus, IOpeningHour } from "../models/Place.js";
import SyncBudgetMonth from "../models/SyncBudgetMonth.js";
import SyncRun, { SyncRunOutcome } from "../models/SyncRun.js";

/**
 * The Google sync as a module, one function per subcommand of
 * syncGooglePlaces.ts. Works on an already-open mongoose connection.
 *
 * `plan` looks Places up in the Google Places API (New) by their Google Place
 * ID and writes a Sync plan: one entry per field Google would change. It
 * writes nothing to Places. Every lookup is billed.
 *
 * Every request counts against the Sync budget: SYNC_BUDGET lookups per US
 * Pacific month, kept in the database so every machine sees the same count.
 * `plan` reserves what it needs before sending anything, or refuses.
 * `budget` shows and corrects the month without asking Google.
 *
 * Google only proposes a field when it returns a value, so data entered by
 * hand is never wiped. Name, address and location are never taken from
 * Google: ours are formatted differently on purpose.
 *
 * Full guide, costs and pitfalls: docs/google-places-sync.md
 */

const CONCURRENCY = 3;

/**
 * Place lookups the sync may send per US Pacific month, below Google's 1,000
 * free Place Details requests (the margin covers the billing account's other
 * uses and month-boundary edge cases). Raising it is a deliberate commit.
 */
export const SYNC_BUDGET = 900;

/** Google's free allowance resets by the calendar in this zone. */
const BUDGET_TIME_ZONE = "America/Los_Angeles";

const pacificParts = (instant: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUDGET_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour };
};

/** The Sync budget month of `now`: "YYYY-MM" of its calendar month in US Pacific. */
const budgetMonth = (now: Date) => {
  const { year, month } = pacificParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
};

/** When the month of `now` ends: the next 1st, 00:00 US Pacific (09:00 Berlin). */
const budgetResetsAt = (now: Date) => {
  const { year, month } = pacificParts(now);
  // The 1st, 00:00 Pacific is 07:00 or 08:00 UTC, depending on daylight saving.
  // Date.UTC takes a 0-based month, so `month` here is already the next one.
  return [7, 8]
    .map((utcHour) => new Date(Date.UTC(year, month, 1, utcHour)))
    .find((candidate) => {
      const parts = pacificParts(candidate);
      return parts.day === 1 && parts.hour === 0;
    })!;
};

/** `plan` was refused before any request: the lookups it needs don't fit in the month. */
export class SyncBudgetRefusal extends Error {
  constructor(
    readonly month: string,
    readonly needed: number,
    readonly left: number,
    readonly resetsAt: Date,
  ) {
    super(
      `Sync budget for ${month}: ${left} of ${SYNC_BUDGET} lookups left, this plan needs ${needed}. ` +
        `Run \`plan --limit=${left}\` or wait for ${resetsAt.toISOString()} (the 1st, 09:00 Berlin).`,
    );
    this.name = "SyncBudgetRefusal";
  }
}

const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

/** Creates the month's document if it is missing; concurrent callers are fine. */
const ensureMonth = async (month: string) => {
  await SyncBudgetMonth.init();
  try {
    await SyncBudgetMonth.updateOne(
      { month },
      { $setOnInsert: { spent: 0, reserved: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
};

const leftIn = (month: { spent: number; reserved: number } | null) =>
  Math.max(0, SYNC_BUDGET - (month?.spent ?? 0) - (month?.reserved ?? 0));

/**
 * Reserves `needed` lookups in one atomic conditional update, so two runs
 * started at once from two machines can't both take what only one fits in.
 */
const reserve = async (month: string, needed: number, now: Date) => {
  await ensureMonth(month);
  const reserved = await SyncBudgetMonth.findOneAndUpdate(
    {
      month,
      $expr: { $lte: [{ $add: ["$spent", "$reserved", needed] }, SYNC_BUDGET] },
    },
    { $inc: { reserved: needed } },
  );
  if (!reserved) {
    const left = leftIn(await SyncBudgetMonth.findOne({ month }).lean());
    throw new SyncBudgetRefusal(month, needed, left, budgetResetsAt(now));
  }
};

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
  /** 429: a quota is hit. Not billed, and it stops the run. */
  | { status: "quota" }
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
    /** Set when Google answered 429 and the run stopped early: a partial plan. */
    stoppedOn?: "429";
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
  if (response.status === 429) return { status: "quota" };
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

type PlannedPlace = Awaited<ReturnType<typeof findPlaces>>[number];
const findPlaces = (limit?: number) =>
  Place.find({ "properties.googleId": { $nin: [null, ""] } })
    .sort({ _id: 1 })
    .limit(limit ?? 0)
    .lean();

/**
 * Looks up every Place with a Google Place ID (the first `limit` by `_id`, if
 * given) and writes `<datetime>-plan.json` into `dir`. Writes nothing to Places.
 *
 * Reserves its lookups from the Sync budget first and throws
 * SyncBudgetRefusal, sending nothing, if they don't fit. Stops on the first
 * 429 and writes a partial plan (`meta.stoppedOn`). Afterwards the month gets
 * what was really sent and the rest of the reservation back, also when the
 * run throws.
 */
export async function plan({ limit, dir, now }: { limit?: number; dir: string; now: Date }) {
  const places = await findPlaces(limit);

  const requests = { sent: 0 };
  const options = { limit, dir, now, requests };
  if (!places.length) return lookUp(places, options);

  // Reserve before the first request; the run takes its month from here even
  // if it finishes after Pacific midnight.
  const month = budgetMonth(now);
  await reserve(month, places.length, now);
  const run = await SyncRun.create({
    month,
    kind: "plan",
    host: hostname(),
    startedAt: now,
    reserved: places.length,
    sent: 0,
  });
  const startedAt = Date.now();

  /** Moves what was sent from reserved to spent, releases the rest, closes the run. */
  const finish = async (outcome: SyncRunOutcome, planPath?: string) => {
    await SyncBudgetMonth.updateOne(
      { month },
      { $inc: { spent: requests.sent, reserved: -places.length } },
    );
    await SyncRun.updateOne(
      { _id: run._id },
      {
        $set: {
          finishedAt: new Date(now.getTime() + Date.now() - startedAt),
          sent: requests.sent,
          outcome,
          ...(planPath && { planPath }),
        },
      },
    );
  };

  let written: Awaited<ReturnType<typeof lookUp>>;
  try {
    written = await lookUp(places, options);
  } catch (error) {
    await finish("error").catch(() => {});
    throw error;
  }
  await finish(written.syncPlan.meta.stoppedOn ? "stopped-429" : "done", written.path);
  return written;
}

/** Asks Google about `places`, counting every request in `requests.sent`, and writes the plan file. */
async function lookUp(
  places: PlannedPlace[],
  { limit, dir, now, requests }: { limit?: number; dir: string; now: Date; requests: { sent: number } },
) {
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

  // The first 429 stops the run: requests in flight finish, nothing new is
  // sent, and every Place left unanswered is failed with reason "quota".
  let stopped = false;

  await runPool(places, async (place) => {
    const placeId = place._id.toString();
    const { name, googleId } = place.properties;
    if (stopped) {
      result.failed.push({ placeId, name, reason: "quota" });
      return;
    }

    let fetched: FetchResult;
    try {
      fetched = await fetchPlace(googleId!);
    } catch (error) {
      // A network failure may still have reached Google: counted as sent.
      fetched = { status: "error", message: (error as Error).message };
    }
    // Every request counts against the Sync budget except one answered 429.
    if (fetched.status === "quota") {
      stopped = true;
      result.meta.stoppedOn = "429";
      result.failed.push({ placeId, name, reason: "quota" });
      return;
    }
    requests.sent++;

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

/**
 * The Sync budget month of `now`: spent, reserved, left and its run records,
 * without asking Google. With `set`, first corrects the month: `spent`
 * becomes `set`, every reservation is released, unfinished plan runs are
 * closed as `error`, and a correction record keeps the reason. Don't correct
 * while a plan is in flight.
 */
export async function budget({ set, reason, now }: { set?: number; reason?: string; now: Date }) {
  const month = budgetMonth(now);

  if (set !== undefined) {
    if (!Number.isInteger(set) || set < 0) throw new Error(`Invalid spent count: ${set}`);
    if (!reason?.trim()) throw new Error("A Sync budget correction needs a reason");
    await ensureMonth(month);
    await SyncBudgetMonth.updateOne({ month }, { $set: { spent: set, reserved: 0 } });
    await SyncRun.updateMany(
      { month, kind: "plan", finishedAt: { $exists: false } },
      { $set: { finishedAt: now, outcome: "error" } },
    );
    await SyncRun.create({
      month,
      kind: "correction",
      host: hostname(),
      startedAt: now,
      finishedAt: now,
      reserved: 0,
      sent: 0,
      reason,
      setTo: set,
    });
  }

  const current = await SyncBudgetMonth.findOne({ month }).lean();
  const runs = await SyncRun.find({ month }).sort({ startedAt: 1, _id: 1 }).lean();
  return {
    month,
    budget: SYNC_BUDGET,
    spent: current?.spent ?? 0,
    reserved: current?.reserved ?? 0,
    left: leftIn(current),
    resetsAt: budgetResetsAt(now),
    runs: runs.map(({ _id, __v, ...run }) => run),
  };
}
