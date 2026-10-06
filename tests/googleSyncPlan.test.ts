/**
 * Google sync `plan`: looking Places up and writing a Sync plan without
 * touching Places, against a throwaway mongod and a fake Google.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { useFakeGoogle } from "./support/fakeGoogle.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { plan, databaseIdentity } = await import("../src/scripts/googleSync.js");

const google = useFakeGoogle();
useThrowawayMongod();

const now = new Date("2026-10-06T12:34:56.789Z");
let dir: string;

beforeEach(async () => {
  google.reset();
  await Place.deleteMany({});
  dir = mkdtempSync(path.join(tmpdir(), "coffemap-google-sync-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

const MONDAY = "Monday: 9:00\u202fAM – 5:30\u202fPM";
const MONDAY_STORED = { day: "Monday", hours: "9 AM to 5:30 PM" };

async function seedPlace(
  name: string,
  properties: Record<string, unknown> = {},
) {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: {
      name,
      address: `${name} Str. 1, Berlin`,
      googleId: `g-${name}`,
      ...properties,
    },
  });
  return place._id.toString();
}

const snapshot = async () =>
  JSON.stringify(await Place.find().sort({ _id: 1 }).lean());

test("each changed field becomes one entry with its current and proposed value", async () => {
  const id = await seedPlace("Bonanza", {
    phone: "+49 30 1",
    website: null,
    openingHours: [{ day: "Monday", hours: "10 AM to 6 PM" }],
  });
  google.place("g-Bonanza", {
    id: "g-Bonanza-new",
    businessStatus: "CLOSED_TEMPORARILY",
    regularOpeningHours: { weekdayDescriptions: [MONDAY] },
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://bonanza.example",
  });

  const { syncPlan } = await plan({ dir, now });

  assert.deepEqual(syncPlan.places, [
    {
      placeId: id,
      name: "Bonanza",
      changes: [
        { field: "businessStatus", current: "OPERATIONAL", proposed: "CLOSED_TEMPORARILY" },
        { field: "googleId", current: "g-Bonanza", proposed: "g-Bonanza-new" },
        {
          field: "openingHours",
          current: [{ day: "Monday", hours: "10 AM to 6 PM" }],
          proposed: [MONDAY_STORED],
        },
        { field: "phone", current: "+49 30 1", proposed: "+49 30 2" },
        { field: "website", current: null, proposed: "https://bonanza.example" },
      ],
    },
  ]);
});

test("a Place whose Google data matches ours, or that Google leaves blank, has no entry", async () => {
  await seedPlace("Same", {
    phone: "+49 30 1",
    website: "https://same.example",
    openingHours: [MONDAY_STORED],
  });
  google.place("g-Same", {
    businessStatus: "OPERATIONAL",
    regularOpeningHours: { weekdayDescriptions: [MONDAY] },
    internationalPhoneNumber: "+49 30 1",
    websiteUri: "https://same.example",
  });
  await seedPlace("Blank", { phone: "+49 30 9", openingHours: [MONDAY_STORED] });
  google.place("g-Blank", {});
  await seedPlace("Closed", { businessStatus: "CLOSED_PERMANENTLY" });
  google.place("g-Closed", { businessStatus: "CLOSED_PERMANENTLY" });

  const { syncPlan } = await plan({ dir, now });

  assert.deepEqual(syncPlan.places, []);
  assert.equal(syncPlan.meta.lookedUp, 3);
});

test("404 goes to notFound and 500 to failed, without a retry", async () => {
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);
  const brokenId = await seedPlace("Broken");
  google.status("g-Broken", 500);

  const { syncPlan } = await plan({ dir, now });

  assert.deepEqual(syncPlan.notFound, [
    { placeId: goneId, name: "Gone", googleId: "g-Gone" },
  ]);
  assert.deepEqual(
    syncPlan.failed.map(({ placeId, name }) => ({ placeId, name })),
    [{ placeId: brokenId, name: "Broken" }],
  );
  assert.match(syncPlan.failed[0].reason, /500/);
  assert.deepEqual(syncPlan.places, []);
  assert.equal(google.calls.length, 2, "one request per Place, no retry");
});

test("--limit looks up only the first N Places by _id", async () => {
  const first = await seedPlace("First", { phone: null });
  await seedPlace("Second");
  await seedPlace("Third");
  for (const name of ["First", "Second", "Third"]) {
    google.place(`g-${name}`, { internationalPhoneNumber: "+49 30 5" });
  }

  const { syncPlan } = await plan({ limit: 2, dir, now });

  assert.deepEqual(
    google.calls.map((call) => call.googleId).sort(),
    ["g-First", "g-Second"],
  );
  assert.equal(syncPlan.meta.lookedUp, 2);
  assert.equal(syncPlan.meta.limit, 2);
  assert.equal(syncPlan.places[0].placeId, first);
});

test("Places without a Google Place ID are not looked up", async () => {
  await seedPlace("NoId", { googleId: null });
  await seedPlace("EmptyId", { googleId: "" });

  const { syncPlan } = await plan({ dir, now });

  assert.equal(google.calls.length, 0);
  assert.equal(syncPlan.meta.lookedUp, 0);
});

test("the plan file lands in dir with its meta, and Places stay unchanged", async () => {
  await seedPlace("Bonanza", { phone: null });
  google.place("g-Bonanza", {
    businessStatus: "CLOSED_PERMANENTLY",
    internationalPhoneNumber: "+49 30 2",
  });
  await seedPlace("Gone");
  google.status("g-Gone", 404);
  const before = await snapshot();

  const { path: planPath, syncPlan } = await plan({ dir, now });

  assert.deepEqual(readdirSync(dir), ["2026-10-06T12-34-56Z-plan.json"]);
  assert.equal(planPath, path.join(dir, "2026-10-06T12-34-56Z-plan.json"));
  const written = JSON.parse(readFileSync(planPath, "utf8"));
  assert.deepEqual(written, syncPlan);
  assert.deepEqual(written.meta, {
    createdAt: now.toISOString(),
    database: {
      host: new URL(process.env.MONGO_URI!).host,
      name: "test",
    },
    lookedUp: 2,
    limit: null,
    fieldMaskVersion: 1,
  });
  assert.equal(written.places.length, 1);
  assert.equal(written.notFound.length, 1);
  assert.equal(await snapshot(), before, "plan writes nothing to Places");
});

test("plan creates a missing dir", async () => {
  const nested = path.join(dir, "untracked", "google-sync");

  const { path: planPath } = await plan({ dir: nested, now });

  assert.equal(path.dirname(planPath), nested);
  assert.deepEqual(readdirSync(nested), ["2026-10-06T12-34-56Z-plan.json"]);
});

test("each request asks for English with today's field mask and the API key", async () => {
  await seedPlace("Bonanza");
  google.place("g-Bonanza");

  await plan({ dir, now });

  assert.deepEqual(google.calls, [
    {
      url: "https://places.googleapis.com/v1/places/g-Bonanza?languageCode=en",
      googleId: "g-Bonanza",
      apiKey: "test-google-places-key",
      fieldMask:
        "id,businessStatus,regularOpeningHours.weekdayDescriptions,internationalPhoneNumber,websiteUri",
    },
  ]);
});

test("the database identity is host and name, never credentials", () => {
  assert.deepEqual(
    databaseIdentity("mongodb+srv://admin:s3cr@t@cluster0.abc.mongodb.net/coffee?retryWrites=true"),
    { host: "cluster0.abc.mongodb.net", name: "coffee" },
  );
  assert.deepEqual(
    databaseIdentity("mongodb://u:p@db1:27017,db2:27017/coffee?replicaSet=rs0"),
    { host: "db1:27017,db2:27017", name: "coffee" },
  );
});
