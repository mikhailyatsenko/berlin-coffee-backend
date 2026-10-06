import { mkdir, readFile, writeFile } from "node:fs/promises";
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
 * `summary` (also run by `plan`) writes the plan's readable `.md` beside it,
 * from the plan file alone, so a trimmed plan can be reviewed again.
 *
 * Every request counts against the Sync budget: SYNC_BUDGET lookups per US
 * Pacific month, kept in the database so every machine sees the same count.
 * `plan` reserves what it needs before sending anything, or refuses.
 * `budget` shows and corrects the month without asking Google.
 *
 * `apply` writes what is left in a reviewed Sync plan to Places, never over a
 * field edited since the plan was made, and records an Applied sync. It sends
 * nothing to Google.
 *
 * `rollback` writes an Applied sync's previous values back to Places, never
 * over a field edited since the apply. It sends nothing to Google.
 *
 * A Place Google answers 404 for gets a proposed `googleNotFoundId` mark;
 * once applied it is a Lost Google match, which `plan` doesn't look up (or
 * reserve for) while the mark equals its Google Place ID, and lists in
 * `skipped` for the summary. A new Google Place ID makes it looked up again.
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

export type SyncField =
  | "businessStatus"
  | "googleId"
  | "openingHours"
  | "phone"
  | "website"
  /** The Lost Google match mark: the Google Place ID that answered 404. */
  | "googleNotFoundId";

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
    /** Places already closed (temporarily or permanently) that Google left unchanged; for the summary. */
    closedUnchanged?: number;
  };
  places: { placeId: string; name: string; changes: SyncChange[] }[];
  notFound: { placeId: string; name: string; googleId: string }[];
  failed: { placeId: string; name: string; reason: string }[];
  /** Lost Google matches: not looked up while their mark equals their Google Place ID. For the summary. */
  skipped?: SkippedPlace[];
}

export interface SkippedPlace {
  placeId: string;
  name: string;
  address: string;
  googleNotFoundId: string;
  /** When the mark was applied (ISO), or null if unknown. */
  markedAt: string | null;
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
  googleNotFoundId?: string | null;
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
const WITH_GOOGLE_ID = { "properties.googleId": { $nin: [null, ""] } };
const IS_LOST_GOOGLE_MATCH = { $eq: ["$properties.googleNotFoundId", "$properties.googleId"] };

/** Places to look up: those with a Google Place ID, except Lost Google matches. */
const findPlaces = (limit?: number) =>
  Place.find({ ...WITH_GOOGLE_ID, $expr: { $not: [IS_LOST_GOOGLE_MATCH] } })
    .sort({ _id: 1 })
    .limit(limit ?? 0)
    .lean();

/** Lost Google matches: marked with the Google Place ID they still have. Never looked up. */
const findLostGoogleMatches = async (): Promise<SkippedPlace[]> => {
  const places = await Place.find({ ...WITH_GOOGLE_ID, $expr: IS_LOST_GOOGLE_MATCH })
    .sort({ _id: 1 })
    .lean();
  return places.map(({ _id, properties }) => ({
    placeId: _id.toString(),
    name: properties.name,
    address: properties.address,
    googleNotFoundId: properties.googleNotFoundId!,
    markedAt: properties.googleNotFoundAt ? new Date(properties.googleNotFoundAt).toISOString() : null,
  }));
};

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
  // Lost Google matches are left out of the lookup and so of the reservation.
  const places = await findPlaces(limit);
  const skipped = await findLostGoogleMatches();

  const requests = { sent: 0 };
  const options = { limit, dir, now, requests, skipped };
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
  {
    limit,
    dir,
    now,
    requests,
    skipped,
  }: { limit?: number; dir: string; now: Date; requests: { sent: number }; skipped: SkippedPlace[] },
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
      closedUnchanged: 0,
    },
    places: [],
    notFound: [],
    failed: [],
    skipped,
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
      // The mark goes through review like any change; once applied, later
      // plans skip the Place until its Google Place ID changes.
      result.places.push({
        placeId,
        name,
        changes: [
          { field: "googleNotFoundId", current: place.properties.googleNotFoundId ?? null, proposed: googleId },
        ],
      });
    } else if (fetched.status === "error") {
      result.failed.push({ placeId, name, reason: fetched.message });
    } else {
      const changes = changesFor(place.properties, fetched.place);
      if (changes.length) result.places.push({ placeId, name, changes });
      else if (isClosed(place.properties.businessStatus)) result.meta.closedUnchanged!++;
    }
  });

  // The pool finishes Places out of order; the file lists them by `_id`.
  result.places.sort(byId);
  result.notFound.sort(byId);
  result.failed.sort(byId);

  await mkdir(dir, { recursive: true });
  const planPath = path.join(dir, `${fileStamp(now)}-plan.json`);
  await writeFile(planPath, `${JSON.stringify(result, null, 2)}\n`);
  const { path: summaryPath } = await summary(planPath);

  return { path: planPath, summaryPath, syncPlan: result };
}

const googleMapsSearch = (name: string, address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;

const isClosed = (status: unknown) => status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY";

const show = (value: unknown) =>
  value === null || value === undefined || value === "" ? "(none)" : `\`${String(value)}\``;

/** Opening hours as a per-day diff: only the days that change, before → after. */
const hoursDiff = (current: unknown, proposed: unknown) => {
  const byDay = (value: unknown) =>
    new Map(((value ?? []) as IOpeningHour[]).map(({ day, hours }) => [day, normalizeSpaces(hours)]));
  const before = byDay(current);
  const after = byDay(proposed);
  return [...new Set([...after.keys(), ...before.keys()])]
    .filter((day) => before.get(day) !== after.get(day))
    .map((day) => `    - ${day}: ${show(before.get(day))} → ${show(after.get(day))}`);
};

/**
 * The readable summary of a Sync plan, built from the plan alone, in the
 * order the admin reviews it: partial-plan warning, counters, status changes
 * (closures, then reopenings), Google Place ID changes, other changes per
 * Place, not found (with its proposed Lost Google match mark), failed, Lost
 * Google matches skipped with a Google Maps search link, already-closed-unchanged.
 */
const renderSummary = (syncPlan: SyncPlan, planFile: string) => {
  const { meta, places, notFound, failed, skipped = [] } = syncPlan;
  // The Lost Google match mark is listed with Not found, not as a change of
  // the Place: a Place whose only entry is the mark isn't "with changes".
  const isMark = ({ field }: SyncChange) => field === "googleNotFoundId";
  const withChanges = places.filter(({ changes }) => changes.some((change) => !isMark(change)));
  const markProposed = new Set(
    places.filter(({ changes }) => changes.some(isMark)).map(({ placeId }) => placeId),
  );
  // A Place whose changes were all trimmed from the JSON counts as unchanged.
  const unchanged = meta.lookedUp - withChanges.length - notFound.length - failed.length;
  const lines: string[] = [];

  if (meta.stoppedOn) {
    lines.push(
      `**Partial plan: stopped on ${meta.stoppedOn}.** Google answered ${meta.stoppedOn} and the run stopped; ` +
        "the Places it left unanswered are under Failed with reason `quota`.",
      "",
    );
  }
  lines.push(
    `# Sync plan ${planFile}`,
    "",
    `Made ${meta.createdAt} from database \`${meta.database?.name}\` on \`${meta.database?.host}\`` +
      (meta.limit ? ` with --limit=${meta.limit}` : "") +
      ". Generated from the plan JSON; after trimming it, regenerate with `summary <plan.json>`.",
    "",
    `- Looked up: ${meta.lookedUp}`,
    `- With changes: ${withChanges.length}`,
    `- Unchanged: ${unchanged}`,
    `- Not found: ${notFound.length}`,
    `- Failed: ${failed.length}`,
    `- Skipped as Lost Google match: ${skipped.length}`,
  );

  const section = (title: string, body: string[]) =>
    lines.push("", `## ${title}`, "", ...(body.length ? body : ["None."]));
  const entries = (field: SyncField) =>
    withChanges.flatMap(({ name, changes }) =>
      changes.filter((change) => change.field === field).map((change) => ({ name, ...change })),
    );
  const beforeAfter = ({ name, current, proposed }: { name: string; current: unknown; proposed: unknown }) =>
    `- **${name}**: ${show(current)} → ${show(proposed)}`;

  const statuses = entries("businessStatus");
  section("Status changes", [
    ...statuses.filter(({ proposed }) => isClosed(proposed)).map((entry) => `${beforeAfter(entry)} (closes)`),
    ...statuses.filter(({ proposed }) => !isClosed(proposed)).map((entry) => `${beforeAfter(entry)} (reopens)`),
  ]);

  section("Google Place ID changes", entries("googleId").map(beforeAfter));

  section(
    "Other changes",
    withChanges.flatMap(({ name, changes }) => {
      const rest = changes.filter(
        (change) => change.field !== "businessStatus" && change.field !== "googleId" && !isMark(change),
      );
      if (!rest.length) return [];
      return [
        `- **${name}**`,
        ...rest.flatMap(({ field, current, proposed }) =>
          field === "openingHours"
            ? ["  - openingHours:", ...hoursDiff(current, proposed)]
            : [`  - ${field}: ${show(current)} → ${show(proposed)}`],
        ),
      ];
    }),
  );

  section(
    "Not found",
    notFound.map(
      ({ placeId, name, googleId }) =>
        `- **${name}**: Google doesn't know ${show(googleId)}; ` +
        (markProposed.has(placeId)
          ? "applying marks it as a Lost Google match, not looked up again until its Google Place ID changes"
          : "no mark in the plan, so the next plan looks it up again"),
    ),
  );
  section("Failed", failed.map(({ name, reason }) => `- **${name}**: ${reason}`));
  section(
    "Skipped: Lost Google match",
    skipped.map(
      ({ name, address, googleNotFoundId, markedAt }) =>
        `- **${name}**, ${address}: Google doesn't know ${show(googleNotFoundId)}, marked ${markedAt ?? "(date unknown)"}. ` +
        `Find it on Google Maps and fix its \`googleId\` by hand: ${googleMapsSearch(name, address)}`,
    ),
  );

  if (meta.closedUnchanged !== undefined) {
    lines.push("", `Already closed and unchanged: ${meta.closedUnchanged}`);
  }
  return `${lines.join("\n")}\n`;
};

/**
 * Writes the readable summary of a Sync plan, `<name>.md` next to
 * `<name>.json`, from the plan file alone: after the admin trims the JSON it
 * shows exactly what `apply` would write. Touches neither the database nor Google.
 */
export async function summary(planPath: string) {
  const syncPlan = JSON.parse(await readFile(planPath, "utf8")) as SyncPlan;
  const markdown = renderSummary(syncPlan, path.basename(planPath));
  const summaryPath = path.join(path.dirname(planPath), `${path.basename(planPath, path.extname(planPath))}.md`);
  await writeFile(summaryPath, markdown);
  return { path: summaryPath, markdown };
}

const SYNC_FIELDS: readonly SyncField[] = [
  "businessStatus",
  "googleId",
  "openingHours",
  "phone",
  "website",
  "googleNotFoundId",
];

/**
 * The `$set` for writing `value` to `field`. The Lost Google match mark sets
 * two properties: setting it stamps `googleNotFoundAt` with `now`, clearing it
 * clears both.
 */
const setField = (field: SyncField, value: unknown, now: Date | null): Record<string, unknown> =>
  field === "googleNotFoundId"
    ? { "properties.googleNotFoundId": value, "properties.googleNotFoundAt": value == null ? null : now }
    : { [`properties.${field}`]: value };
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
        Object.assign(update, setField(field, proposed, now));
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
        // A restored mark has no date of its own: rolling one back clears both.
        Object.assign(update, setField(field, current, null));
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
