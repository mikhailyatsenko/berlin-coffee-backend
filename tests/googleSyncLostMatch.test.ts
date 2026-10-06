/**
 * Google sync Lost Google match: a Place Google answers 404 for gets a mark
 * through the plan; once applied, later plans skip it (and leave it out of
 * the Sync budget reservation) until its Google Place ID changes. Throwaway
 * mongod + fake Google.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { useFakeGoogle } from "./support/fakeGoogle.js";

setTestEnv();

const { default: mongoose } = await import("mongoose");
const { default: Place } = await import("../src/models/Place.js");
const { plan, apply, rollback, budget, summary } = await import("../src/scripts/googleSync.js");

const google = useFakeGoogle();
useThrowawayMongod();

const planTime = new Date("2026-10-06T12:00:00.000Z");
const applyTime = new Date("2026-10-06T13:00:00.000Z");
const nextPlanTime = new Date("2026-10-07T12:00:00.000Z");
let dir: string;

beforeEach(async () => {
  google.reset();
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
  dir = mkdtempSync(path.join(tmpdir(), "coffemap-google-sync-lost-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

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

test("a 404 yields a notFound item and a proposed mark recording the Place ID that failed", async () => {
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);

  const { syncPlan } = await plan({ dir, now: planTime });

  assert.deepEqual(syncPlan.notFound, [{ placeId: goneId, name: "Gone", googleId: "g-Gone" }]);
  assert.deepEqual(syncPlan.places, [
    {
      placeId: goneId,
      name: "Gone",
      changes: [{ field: "googleNotFoundId", current: null, proposed: "g-Gone" }],
    },
  ]);
});

const propertiesOf = async (id: string) => (await Place.findById(id).lean())!.properties;

test("after the mark is applied the next plan skips the Place, lists it as skipped and reserves one less", async () => {
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);
  await seedPlace("Bonanza");
  google.place("g-Bonanza");
  const { path: planPath } = await plan({ dir, now: planTime });

  const { appliedSync } = await apply(planPath, { now: applyTime });

  assert.deepEqual(appliedSync.written, [
    { placeId: goneId, name: "Gone", field: "googleNotFoundId", current: null, proposed: "g-Gone" },
  ]);
  const marked = await propertiesOf(goneId);
  assert.equal(marked.googleNotFoundId, "g-Gone");
  assert.deepEqual(marked.googleNotFoundAt, applyTime);
  assert.equal(marked.googleId, "g-Gone", "the Google Place ID itself is left as it is");

  google.reset();
  google.place("g-Bonanza");
  const spentBefore = (await budget({ now: nextPlanTime })).spent;
  const { syncPlan } = await plan({ dir, now: nextPlanTime });

  assert.deepEqual(google.calls.map((call) => call.googleId), ["g-Bonanza"]);
  assert.equal(syncPlan.meta.lookedUp, 1);
  assert.deepEqual(syncPlan.notFound, []);
  assert.deepEqual(syncPlan.places, []);
  assert.deepEqual(syncPlan.skipped, [
    {
      placeId: goneId,
      name: "Gone",
      address: "Gone Str. 1, Berlin",
      googleNotFoundId: "g-Gone",
      markedAt: applyTime.toISOString(),
    },
  ]);
  const month = await budget({ now: nextPlanTime });
  assert.equal(month.spent - spentBefore, 1);
  assert.equal(month.runs.at(-1)!.reserved, 1, "the Lost Google match is left out of the reservation");
});

test("after its Google Place ID is changed by hand the Place is looked up again, without clearing the mark", async () => {
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);
  const { path: planPath } = await plan({ dir, now: planTime });
  await apply(planPath, { now: applyTime });
  // The admin finds the Place on Google Maps and fixes its ID in Mongo.
  await Place.updateOne({ _id: goneId }, { "properties.googleId": "g-Found" });
  google.reset();
  google.place("g-Found", { internationalPhoneNumber: "+49 30 7" });

  const { syncPlan } = await plan({ dir, now: nextPlanTime });

  assert.deepEqual(google.calls.map((call) => call.googleId), ["g-Found"]);
  assert.equal(syncPlan.meta.lookedUp, 1);
  assert.deepEqual(syncPlan.skipped, []);
  assert.deepEqual(syncPlan.places, [
    { placeId: goneId, name: "Gone", changes: [{ field: "phone", current: null, proposed: "+49 30 7" }] },
  ]);
});

test("a marked Place whose new Google Place ID answers 404 too gets a new mark over the old one", async () => {
  const goneId = await seedPlace("Gone", { googleId: "g-New", googleNotFoundId: "g-Old" });
  google.status("g-New", 404);

  const { syncPlan } = await plan({ dir, now: planTime });

  assert.deepEqual(syncPlan.places, [
    { placeId: goneId, name: "Gone", changes: [{ field: "googleNotFoundId", current: "g-Old", proposed: "g-New" }] },
  ]);
});

test("rolling back the mark clears both the mark and its date, and the next plan looks the Place up again", async () => {
  const goneId = await seedPlace("Gone");
  google.status("g-Gone", 404);
  const { path: planPath } = await plan({ dir, now: planTime });
  const { path: appliedPath } = await apply(planPath, { now: applyTime });

  const { restored, leftAlone } = await rollback(appliedPath);

  assert.deepEqual(restored, [
    { placeId: goneId, name: "Gone", field: "googleNotFoundId", restored: null, replaced: "g-Gone" },
  ]);
  assert.deepEqual(leftAlone, []);
  const stored = await propertiesOf(goneId);
  assert.equal(stored.googleNotFoundId, null);
  assert.equal(stored.googleNotFoundAt, null);

  google.reset();
  google.status("g-Gone", 404);
  await plan({ dir, now: nextPlanTime });
  assert.deepEqual(google.calls.map((call) => call.googleId), ["g-Gone"]);
});

test("the summary lists each Lost Google match with when it was marked and a Google Maps search link", async () => {
  await seedPlace("Gone Café");
  google.status("g-Gone Café", 404);
  const { path: planPath } = await plan({ dir, now: planTime });
  await apply(planPath, { now: applyTime });

  const { path: nextPlanPath } = await plan({ dir, now: nextPlanTime });
  const { markdown } = await summary(nextPlanPath);

  assert.ok(
    markdown.includes(
      "https://www.google.com/maps/search/?api=1&query=Gone%20Caf%C3%A9%2C%20Gone%20Caf%C3%A9%20Str.%201%2C%20Berlin",
    ),
  );
  assert.ok(markdown.includes(applyTime.toISOString()), "when it was marked");
});
