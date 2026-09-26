import "../config/env.js";
import mongoose from "mongoose";
import Place, { BusinessStatus, IOpeningHour } from "../models/Place.js";

/**
 * Refreshes opening hours, phone and website of every place from the
 * Google Places API (New), using the Place ID stored in properties.googleId.
 *
 * Dry run by default — prints the diff without writing:
 *   node dist/scripts/syncGooglePlaces.js
 * Write the changes:
 *   node dist/scripts/syncGooglePlaces.js --apply
 * Try it on a few places first (each request is billed):
 *   node dist/scripts/syncGooglePlaces.js --limit=5
 *
 * Google only overwrites a field when it returns a value, so data entered by
 * hand is never wiped. Places Google reports as closed get their businessStatus
 * set, which hides them from listings; they reappear once Google reports them
 * open again. Nothing is deleted. Address and coordinates are left alone: ours
 * are formatted differently on purpose.
 *
 * Requires GOOGLE_PLACES_API_KEY with "Places API (New)" enabled.
 * Full guide, costs and pitfalls: docs/google-places-sync.md
 */

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const APPLY = process.argv.includes("--apply");
// --limit=N syncs only the first N places: every request is billed, so test small.
const LIMIT = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1]) || 0;
const CONCURRENCY = 3;
const MAX_RETRIES = 4;

const FIELD_MASK = [
  "id",
  "businessStatus",
  "regularOpeningHours.weekdayDescriptions",
  "internationalPhoneNumber",
  "websiteUri",
].join(",");

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchPlace = async (placeId: string, attempt = 0): Promise<FetchResult> => {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
    {
      headers: {
        "X-Goog-Api-Key": API_KEY!,
        "X-Goog-FieldMask": FIELD_MASK,
      },
    },
  );

  if (response.status === 404) return { status: "not_found" };
  // Per-minute quota; the minute window resets quickly, so back off and retry.
  if (response.status === 429 && attempt < MAX_RETRIES) {
    await sleep(15_000 * (attempt + 1));
    return fetchPlace(placeId, attempt + 1);
  }
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

const sameHours = (stored: IOpeningHour[] = [], fresh: IOpeningHour[]) =>
  JSON.stringify(stored.map(({ day, hours }) => ({ day, hours: normalizeSpaces(hours) }))) ===
  JSON.stringify(fresh);

const runPool = async <T>(items: T[], worker: (item: T) => Promise<void>) => {
  let next = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
};

const sync = async () => {
  if (!API_KEY) throw new Error("Missing environment variable: GOOGLE_PLACES_API_KEY");

  await mongoose.connect(process.env.MONGO_URI!);
  console.log(`Connected to MongoDB (${APPLY ? "APPLY" : "DRY RUN"})`);

  const places = await Place.find({ "properties.googleId": { $nin: [null, ""] } })
    .sort({ _id: 1 })
    .limit(LIMIT);
  console.log(`Syncing ${places.length} places`);

  const closed: string[] = [];
  const notFound: string[] = [];
  const failed: string[] = [];
  let updated = 0;

  await runPool(places, async (place) => {
    const { name, googleId } = place.properties;
    const label = `${name} (${place._id})`;
    const result = await fetchPlace(googleId!);

    if (result.status === "not_found") return void notFound.push(label);
    if (result.status === "error") return void failed.push(`${label}: ${result.message}`);

    const google = result.place;
    if (google.businessStatus && google.businessStatus !== "OPERATIONAL") {
      closed.push(`${label}: ${google.businessStatus}`);
    }

    const changes: Record<string, unknown> = {};

    const storedStatus = place.properties.businessStatus ?? "OPERATIONAL";
    if (google.businessStatus && google.businessStatus !== storedStatus) {
      changes["properties.businessStatus"] = google.businessStatus;
    }

    // Google may migrate a place to a new ID; keep ours current.
    if (google.id && google.id !== googleId) changes["properties.googleId"] = google.id;

    const descriptions = google.regularOpeningHours?.weekdayDescriptions;
    if (descriptions?.length) {
      const hours = toOpeningHours(descriptions);
      if (!sameHours(place.properties.openingHours, hours)) {
        changes["properties.openingHours"] = hours;
      }
    }

    if (google.internationalPhoneNumber && google.internationalPhoneNumber !== place.properties.phone) {
      changes["properties.phone"] = google.internationalPhoneNumber;
    }

    if (google.websiteUri && google.websiteUri !== place.properties.website) {
      changes["properties.website"] = google.websiteUri;
    }

    if (Object.keys(changes).length === 0) return;

    updated++;
    console.log(`\n~ ${label}`);
    for (const [field, value] of Object.entries(changes)) {
      console.log(`  ${field}: ${JSON.stringify(value)}`);
    }

    if (APPLY) await Place.updateOne({ _id: place._id }, { $set: changes });
  });

  console.log(`\n${APPLY ? "Updated" : "Would update"} ${updated} of ${places.length} places`);
  if (closed.length) console.log(`\nNot operational (hidden from listings):\n  ${closed.join("\n  ")}`);
  if (notFound.length) console.log(`\nPlace ID not found:\n  ${notFound.join("\n  ")}`);
  if (failed.length) console.log(`\nFailed requests:\n  ${failed.join("\n  ")}`);

  await mongoose.disconnect();
};

sync().catch(async (error) => {
  console.error("Sync failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
