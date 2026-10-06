/**
 * Google sync `rollback`: writing an Applied sync's previous values back to
 * Places, leaving alone fields edited since the apply, against a throwaway
 * mongod and a fake Google (the fake only answers `plan`, which makes the
 * plans these tests apply and roll back).
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { useFakeGoogle } from "./support/fakeGoogle.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { plan, apply, rollback, DatabaseMismatchError } = await import("../src/scripts/googleSync.js");

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

const MONDAY = "Monday: 9:00 AM – 5:30 PM";

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

/** Plan with the fake Google and apply it, so every test rolls back a real Applied sync. */
async function planAndApply() {
  const { path: planPath } = await plan({ dir, now: planTime });
  const { path: appliedPath } = await apply(planPath, { now: applyTime });
  return appliedPath;
}

test("rollback restores the previous values and leaves alone a field edited since the apply", async () => {
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
  const appliedPath = await planAndApply();
  // Since the apply: the website was fixed by hand.
  await Place.updateOne({ _id: id }, { "properties.website": "https://by-hand.example" });

  const result = await rollback(appliedPath);

  assert.deepEqual(result.restored, [
    { placeId: id, name: "Bonanza", field: "businessStatus", restored: "OPERATIONAL", replaced: "CLOSED_TEMPORARILY" },
    {
      placeId: id,
      name: "Bonanza",
      field: "openingHours",
      restored: [{ day: "Monday", hours: "10 AM to 6 PM" }],
      replaced: [{ day: "Monday", hours: "9 AM to 5:30 PM" }],
    },
    { placeId: id, name: "Bonanza", field: "phone", restored: "+49 30 1", replaced: "+49 30 2" },
  ]);
  assert.deepEqual(result.leftAlone, [
    { placeId: id, name: "Bonanza", field: "website", reason: "changed since apply" },
  ]);
  const stored = await propertiesOf(id);
  assert.equal(stored.businessStatus, "OPERATIONAL");
  assert.deepEqual(
    stored.openingHours?.map(({ day, hours }) => ({ day, hours })),
    [{ day: "Monday", hours: "10 AM to 6 PM" }],
  );
  assert.equal(stored.phone, "+49 30 1");
  assert.equal(stored.website, "https://by-hand.example", "a newer manual edit is never overwritten");
});

test("skipped entries of the Applied sync are ignored", async () => {
  const id = await seedPlace("Bonanza", { phone: "+49 30 1", website: "https://old.example" });
  google.place("g-Bonanza", {
    internationalPhoneNumber: "+49 30 2",
    websiteUri: "https://bonanza.example",
  });
  const { path: planPath } = await plan({ dir, now: planTime });
  // Before the apply someone set the phone Google proposes, so apply skips it
  // as "already applied"; rollback must not turn it back into the plan's old value.
  await Place.updateOne({ _id: id }, { "properties.phone": "+49 30 2" });
  const { path: appliedPath } = await apply(planPath, { now: applyTime });

  const result = await rollback(appliedPath);

  assert.deepEqual(
    result.restored.map(({ field }) => field),
    ["website"],
  );
  assert.deepEqual(result.leftAlone, []);
  const stored = await propertiesOf(id);
  assert.equal(stored.phone, "+49 30 2");
  assert.equal(stored.website, "https://old.example");
});

test("an Applied sync from a different database is refused and nothing is written", async () => {
  const id = await seedPlace("Bonanza", { phone: "+49 30 1" });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const appliedPath = await planAndApply();
  const foreign = readJson(appliedPath);
  foreign.meta.database = { host: "cluster0.abc.mongodb.net", name: "coffee" };
  writeFileSync(appliedPath, JSON.stringify(foreign));

  await assert.rejects(rollback(appliedPath), (error: unknown) => {
    assert.ok(error instanceof DatabaseMismatchError);
    assert.deepEqual(error.file, { host: "cluster0.abc.mongodb.net", name: "coffee" });
    return true;
  });

  assert.equal((await propertiesOf(id)).phone, "+49 30 2");
});

test("a field that was missing before the apply is restored to its empty value", async () => {
  const { insertedId } = await Place.collection.insertOne({
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.4, 52.5] },
    properties: { name: "Old", address: "Old Str. 1, Berlin", googleId: "g-Old" },
  });
  const id = insertedId.toString();
  google.place("g-Old", {
    businessStatus: "CLOSED_PERMANENTLY",
    internationalPhoneNumber: "+49 30 2",
  });
  const appliedPath = await planAndApply();

  const result = await rollback(appliedPath);

  assert.deepEqual(
    result.restored.map(({ field, restored }) => ({ field, restored })),
    [
      { field: "businessStatus", restored: "OPERATIONAL" },
      { field: "phone", restored: null },
    ],
  );
  const stored = await propertiesOf(id);
  assert.equal(stored.businessStatus, "OPERATIONAL");
  assert.equal(stored.phone, null);
});

test("rerunning rollback is harmless: everything is left alone", async () => {
  const id = await seedPlace("Bonanza", { phone: "+49 30 1" });
  google.place("g-Bonanza", { internationalPhoneNumber: "+49 30 2" });
  const appliedPath = await planAndApply();
  await rollback(appliedPath);

  const result = await rollback(appliedPath);

  assert.deepEqual(result.restored, []);
  assert.deepEqual(result.leftAlone, [
    { placeId: id, name: "Bonanza", field: "phone", reason: "changed since apply" },
  ]);
  assert.equal((await propertiesOf(id)).phone, "+49 30 1");
});
