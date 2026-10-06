/**
 * Google sync `apply`: writing what is left in a reviewed Sync plan to Places
 * and recording an Applied sync, against a throwaway mongod and a fake Google
 * (the fake only answers `plan`, which makes the plans these tests apply).
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { useFakeGoogle } from "./support/fakeGoogle.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { plan, apply, DatabaseMismatchError } = await import("../src/scripts/googleSync.js");

const google = useFakeGoogle();
useThrowawayMongod();

const planTime = new Date("2026-10-06T12:00:00.000Z");
const applyTime = new Date("2026-10-06T13:00:00.000Z");
let dir: string;

beforeEach(async () => {
  google.reset();
  await Place.deleteMany({});
  dir = mkdtempSync(path.join(tmpdir(), "coffemap-google-sync-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

const MONDAY = "Monday: 9:00 AM – 5:30 PM";
const MONDAY_STORED = { day: "Monday", hours: "9 AM to 5:30 PM" };

async function seedPlace(name: string, properties: Record<string, unknown> = {}) {
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

const propertiesOf = async (id: string) => {
  const place = await Place.findById(id).lean();
  return place!.properties;
};

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/** Plan once with the fake Google, so every test applies a real plan file. */
async function makePlan(now = planTime) {
  const { path: planPath } = await plan({ dir, now });
  return planPath;
}

test("each entry is written, already applied, or skipped as changed since plan; the Place's other entries still apply", async () => {
  const id = await seedPlace("Bonanza", {
    phone: "+49 30 1",
    website: "https://old.example",
    openingHours: [{ day: "Monday", hours: "10 AM to 6 PM" }],
  });
  google.place("g-Bonanza", {
    businessStatus: "CLOSED_TEMPORARILY",
    regularOpeningHours: { weekdayDescriptions: [MONDAY] },
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://bonanza.example",
  });
  const planPath = await makePlan();
  // Since the plan: someone already set the phone Google proposes, and fixed
  // the website by hand.
  await Place.updateOne(
    { _id: id },
    { "properties.phone": "+49 30 2", "properties.website": "https://by-hand.example" },
  );

  const { appliedSync } = await apply(planPath, { now: applyTime });

  assert.deepEqual(appliedSync.written, [
    { placeId: id, name: "Bonanza", field: "businessStatus", current: "OPERATIONAL", proposed: "CLOSED_TEMPORARILY" },
    {
      placeId: id,
      name: "Bonanza",
      field: "openingHours",
      current: [{ day: "Monday", hours: "10 AM to 6 PM" }],
      proposed: [MONDAY_STORED],
    },
  ]);
  assert.deepEqual(appliedSync.skipped, [
    { placeId: id, name: "Bonanza", field: "phone", reason: "already applied" },
    { placeId: id, name: "Bonanza", field: "website", reason: "changed since plan" },
  ]);
  const stored = await propertiesOf(id);
  assert.equal(stored.businessStatus, "CLOSED_TEMPORARILY");
  assert.deepEqual(stored.openingHours, [MONDAY_STORED]);
  assert.equal(stored.phone, "+49 30 2");
  assert.equal(stored.website, "https://by-hand.example", "a manual edit is never overwritten");
});

test("an old document without status, phone or website, and hours stored with narrow spaces, still matches its plan", async () => {
  const { insertedId } = await Place.collection.insertOne({
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.4, 52.5] },
    properties: {
      name: "Old",
      address: "Old Str. 1, Berlin",
      googleId: "g-Old",
      openingHours: [{ day: "Monday", hours: "10 AM to 6 PM" }],
    },
  });
  const id = insertedId.toString();
  google.place("g-Old", {
    businessStatus: "CLOSED_PERMANENTLY",
    regularOpeningHours: { weekdayDescriptions: [MONDAY] },
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://old.example",
  });
  const planPath = await makePlan();

  const { appliedSync } = await apply(planPath, { now: applyTime });

  assert.deepEqual(
    appliedSync.written.map(({ field, current }) => ({ field, current })),
    [
      { field: "businessStatus", current: "OPERATIONAL" },
      { field: "openingHours", current: [{ day: "Monday", hours: "10 AM to 6 PM" }] },
      { field: "phone", current: null },
      { field: "website", current: null },
    ],
  );
  assert.deepEqual(appliedSync.skipped, []);
  const stored = await propertiesOf(id);
  assert.equal(stored.businessStatus, "CLOSED_PERMANENTLY");
  assert.deepEqual(stored.openingHours, [MONDAY_STORED]);
  assert.equal(stored.phone, "+49 30 2");
  assert.equal(stored.website, "https://old.example");
});

test("only entries left in the plan are written; notFound and failed are ignored", async () => {
  const keptId = await seedPlace("Kept", { phone: null, website: null });
  google.place("g-Kept", {
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://kept.example",
  });
  const droppedId = await seedPlace("Dropped", { phone: null });
  google.place("g-Dropped", { internationalPhoneNumber: "+49 30 3" });
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);
  const brokenId = await seedPlace("Broken");
  google.status("g-Broken", 500);
  const planPath = await makePlan();
  // The admin's review: drop Kept's website and the whole Dropped Place.
  const reviewed = readJson(planPath);
  reviewed.places = reviewed.places
    .filter((place: { name: string }) => place.name === "Kept")
    .map((place: { changes: { field: string }[] }) => ({
      ...place,
      changes: place.changes.filter((change) => change.field !== "website"),
    }));
  writeFileSync(planPath, JSON.stringify(reviewed));
  const others = { _id: { $in: [droppedId, goneId, brokenId] } };
  const untouched = await Place.find(others).lean();

  const { appliedSync } = await apply(planPath, { now: applyTime });

  assert.deepEqual(appliedSync.written, [
    { placeId: keptId, name: "Kept", field: "phone", current: null, proposed: "+49 30 2" },
  ]);
  assert.deepEqual(appliedSync.skipped, []);
  assert.equal((await propertiesOf(keptId)).website, null);
  assert.deepEqual(await Place.find(others).lean(), untouched);
});

test("a plan made from a different database is refused and nothing is written", async () => {
  const id = await seedPlace("Bonanza", { phone: null });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const planPath = await makePlan();
  const foreign = readJson(planPath);
  foreign.meta.database = { host: "cluster0.abc.mongodb.net", name: "coffee" };
  writeFileSync(planPath, JSON.stringify(foreign));

  await assert.rejects(apply(planPath, { now: applyTime }), (error: unknown) => {
    assert.ok(error instanceof DatabaseMismatchError);
    assert.deepEqual(error.file, { host: "cluster0.abc.mongodb.net", name: "coffee" });
    return true;
  });

  assert.equal((await propertiesOf(id)).phone, null);
  assert.deepEqual(readdirSync(dir), [path.basename(planPath)], "no Applied sync file");
});

test("a plan older than 7 days still applies, with a warning", async () => {
  const id = await seedPlace("Bonanza", { phone: null });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const planPath = await makePlan(new Date("2026-09-28T12:00:00.000Z"));

  const fresh = await apply(planPath, { now: new Date("2026-10-05T12:00:00.000Z") });
  assert.deepEqual(fresh.warnings, [], "exactly 7 days is not old");

  await Place.updateOne({ _id: id }, { "properties.phone": null });
  const old = await apply(planPath, { now: applyTime });

  assert.equal(old.warnings.length, 1);
  assert.match(old.warnings[0], /8 days old/);
  assert.equal(old.appliedSync.written.length, 1);
  assert.equal((await propertiesOf(id)).phone, "+49 30 2");
});

test("the Applied sync file lands next to the plan with the plan's database and what was written over", async () => {
  const id = await seedPlace("Bonanza", { phone: "+49 30 1", website: "https://old.example" });
  google.place("g-Bonanza", {
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://bonanza.example",
  });
  const planPath = await makePlan();
  await Place.updateOne({ _id: id }, { "properties.website": "https://by-hand.example" });

  const { path: appliedPath, appliedSync } = await apply(planPath, { now: applyTime });

  assert.equal(appliedPath, path.join(dir, "2026-10-06T13-00-00Z-applied.json"));
  const written = readJson(appliedPath);
  assert.deepEqual(written, appliedSync);
  assert.deepEqual(written, {
    meta: {
      plan: "2026-10-06T12-00-00Z-plan.json",
      planCreatedAt: planTime.toISOString(),
      appliedAt: applyTime.toISOString(),
      database: readJson(planPath).meta.database,
    },
    written: [
      { placeId: id, name: "Bonanza", field: "phone", current: "+49 30 1", proposed: "+49 30 2" },
    ],
    skipped: [{ placeId: id, name: "Bonanza", field: "website", reason: "changed since plan" }],
  });
});

test("rerunning apply is harmless: everything is already applied", async () => {
  const id = await seedPlace("Bonanza", { phone: null });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const planPath = await makePlan();
  await apply(planPath, { now: applyTime });

  const { appliedSync } = await apply(planPath, { now: new Date("2026-10-06T14:00:00.000Z") });

  assert.deepEqual(appliedSync.written, []);
  assert.deepEqual(appliedSync.skipped, [
    { placeId: id, name: "Bonanza", field: "phone", reason: "already applied" },
  ]);
});

test("a plan entry for a field the sync doesn't own is refused before anything is written", async () => {
  const id = await seedPlace("Bonanza", { phone: null });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const planPath = await makePlan();
  const edited = readJson(planPath);
  edited.places[0].changes.push({ field: "name", current: "Bonanza", proposed: "Hacked" });
  writeFileSync(planPath, JSON.stringify(edited));

  await assert.rejects(apply(planPath, { now: applyTime }), /name/);

  const stored = await propertiesOf(id);
  assert.equal(stored.phone, null);
  assert.equal(stored.name, "Bonanza");
});
