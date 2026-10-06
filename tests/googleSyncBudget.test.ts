/**
 * Google sync Sync budget: `plan` reserves its lookups from the month's 900
 * before sending any, counts what it really sent, stops on the first 429;
 * `budget` shows and corrects the month. Throwaway mongod + fake Google.
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

const { default: mongoose } = await import("mongoose");
const { default: Place } = await import("../src/models/Place.js");
const { default: SyncRun } = await import("../src/models/SyncRun.js");
const { plan, budget, SyncBudgetRefusal } = await import("../src/scripts/googleSync.js");

const google = useFakeGoogle();
useThrowawayMongod();

const now = new Date("2026-10-06T12:34:56.789Z");
let dir: string;

beforeEach(async () => {
  google.reset();
  // Empties Places and the Sync budget's month and run records, keeping indexes.
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
  dir = mkdtempSync(path.join(tmpdir(), "coffemap-google-sync-budget-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Places P00, P01… in `_id` order, each known to Google with nothing to change. */
async function seedPlaces(count: number) {
  const seeded: { placeId: string; name: string }[] = [];
  for (let index = 0; index < count; index++) {
    const name = `P${String(index).padStart(2, "0")}`;
    const place = await Place.create({
      geometry: { coordinates: [13.4, 52.5] },
      properties: { name, address: `${name} Str. 1, Berlin`, googleId: `g-${name}` },
    });
    google.place(`g-${name}`);
    seeded.push({ placeId: place._id.toString(), name });
  }
  return seeded;
}

test("a plan that doesn't fit is refused before any request, and the month is unchanged", async () => {
  await budget({ set: 890, reason: "seed", now });
  await seedPlaces(11);

  await assert.rejects(plan({ dir, now }), (error: unknown) => {
    assert.ok(error instanceof SyncBudgetRefusal);
    assert.equal(error.left, 10);
    assert.equal(error.needed, 11);
    assert.equal(error.resetsAt.toISOString(), "2026-11-01T07:00:00.000Z");
    assert.match(error.message, /--limit=10/);
    return true;
  });

  assert.equal(google.calls.length, 0);
  const month = await budget({ now });
  assert.equal(month.month, "2026-10");
  assert.equal(month.spent, 890);
  assert.equal(month.reserved, 0);
  assert.equal(month.left, 10);
});

test("after a run spent is what was sent, 404 and 500 included, and the run is recorded", async () => {
  await seedPlaces(3);
  google.status("g-P01", 404);
  google.status("g-P02", 500);

  const { path: planPath } = await plan({ dir, now });

  const month = await budget({ now });
  assert.equal(month.spent, 3);
  assert.equal(month.reserved, 0);
  assert.equal(month.left, 897);
  assert.equal(month.runs.length, 1);
  const [run] = month.runs;
  assert.equal(run.kind, "plan");
  assert.equal(run.month, "2026-10");
  assert.equal(run.reserved, 3);
  assert.equal(run.sent, 3);
  assert.equal(run.outcome, "done");
  assert.equal(run.planPath, planPath);
  assert.equal(typeof run.host, "string");
  assert.deepEqual(run.startedAt, now);
  assert.ok(run.finishedAt! >= now);
});

test("the first 429 stops the run: no new requests, a partial plan, the 429 not counted", async () => {
  const ids = await seedPlaces(9);
  google.status("g-P00", 429);

  const { path: planPath, syncPlan } = await plan({ dir, now });

  const requested = new Set(google.calls.map((call) => call.googleId));
  assert.ok(requested.has("g-P00"));
  assert.ok(google.calls.length < 9, "Places after the 429 are not requested");
  assert.equal(google.calls.length, requested.size, "no retry");

  assert.equal(syncPlan.meta.stoppedOn, "429");
  assert.deepEqual(JSON.parse(readFileSync(planPath, "utf8")).meta.stoppedOn, "429");
  // The 429'd Place and every Place never requested; the answered ones are not failed.
  const unanswered = ids.filter(({ name }) => name === "P00" || !requested.has(`g-${name}`));
  assert.deepEqual(
    syncPlan.failed,
    unanswered.map(({ placeId, name }) => ({ placeId, name, reason: "quota" })),
  );

  const month = await budget({ now });
  assert.equal(month.spent, google.calls.length - 1, "every request but the 429");
  assert.equal(month.reserved, 0, "the rest of the reservation is released");
  assert.equal(month.runs[0].outcome, "stopped-429");
  assert.equal(month.runs[0].sent, google.calls.length - 1);
});

test("a run that throws still counts what it sent, releases the rest and is closed as error", async () => {
  await seedPlaces(2);
  const notADir = path.join(dir, "taken");
  writeFileSync(notADir, "");

  await assert.rejects(plan({ dir: path.join(notADir, "plans"), now }));

  const month = await budget({ now });
  assert.equal(month.spent, 2);
  assert.equal(month.reserved, 0);
  assert.equal(month.runs[0].outcome, "error");
  assert.equal(month.runs[0].sent, 2);
  assert.ok(month.runs[0].finishedAt);
  assert.equal(month.runs[0].planPath, undefined);
});

test("a run that crashes mid-lookup sends nothing after it is counted: spent covers every request", async () => {
  await seedPlaces(9);
  // P00's answer crashes the run while P01 and P02 are still in flight.
  google.place("g-P00", { regularOpeningHours: { weekdayDescriptions: "not a list" } });
  google.place("g-P01", {}, { delayMs: 30 });
  google.place("g-P02", {}, { delayMs: 30 });

  await assert.rejects(plan({ dir, now }));
  // Lanes still running would keep sending after the rejection.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const month = await budget({ now });
  assert.equal(google.calls.length, 3, "nothing new is sent after the crash");
  assert.equal(month.spent, google.calls.length, "every request sent is counted");
  assert.equal(month.reserved, 0);
  assert.equal(month.runs[0].outcome, "error");
  assert.equal(month.runs[0].sent, google.calls.length);
});

/** Makes `method` of `model` throw on its next call only, as if the database dropped then. */
function failOnce(model: Record<string, unknown>, method: string) {
  const original = model[method];
  model[method] = () => {
    model[method] = original;
    return Promise.reject(new Error("connection lost"));
  };
}

test("if the run can't be recorded after reserving, the reservation is released and nothing is sent", async () => {
  await seedPlaces(3);
  failOnce(SyncRun as unknown as Record<string, unknown>, "create");

  await assert.rejects(plan({ dir, now }), /connection lost/);

  assert.equal(google.calls.length, 0);
  const month = await budget({ now });
  assert.equal(month.reserved, 0);
  assert.equal(month.spent, 0);
});

test("if closing the run fails after the plan is written, the plan is returned with a warning and the month is still settled", async () => {
  await seedPlaces(3);
  failOnce(SyncRun as unknown as Record<string, unknown>, "updateOne");

  const { path: planPath, warnings } = await plan({ dir, now });

  assert.ok(readFileSync(planPath, "utf8"));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /budget/);
  const month = await budget({ now });
  assert.equal(month.spent, 3, "the month gets what was sent although the run record failed");
  assert.equal(month.reserved, 0);
});

test("a fully finished plan has no warnings", async () => {
  await seedPlaces(1);
  assert.deepEqual((await plan({ dir, now })).warnings, []);
});

test("two plans at once that don't fit together: exactly one is refused", async () => {
  await budget({ set: 890, reason: "seed", now });
  await seedPlaces(6);

  const outcomes = await Promise.allSettled([plan({ dir, now }), plan({ dir, now })]);

  const refused = outcomes.filter(
    (outcome) => outcome.status === "rejected" && outcome.reason instanceof SyncBudgetRefusal,
  );
  assert.equal(refused.length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(google.calls.length, 6);
  const month = await budget({ now });
  assert.equal(month.spent, 896);
  assert.equal(month.reserved, 0);
});

test("a run that never finished shows in budget, and budget --set clears its reservation", async () => {
  await seedPlaces(4);
  google.hang("g-P00");
  // Never settles, like a process killed mid-run: its reservation stays held.
  void plan({ dir, now });
  while (!google.calls.some((call) => call.googleId === "g-P00")) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const stuck = await budget({ now });
  assert.equal(stuck.reserved, 4);
  assert.equal(stuck.left, 896);
  assert.equal(stuck.runs.length, 1);
  assert.equal(stuck.runs[0].kind, "plan");
  assert.equal(stuck.runs[0].finishedAt, undefined);
  assert.equal(stuck.runs[0].outcome, undefined);

  const later = new Date("2026-10-07T08:00:00Z");
  const corrected = await budget({ set: 120, reason: "seed from GMP console", now: later });

  assert.equal(corrected.spent, 120);
  assert.equal(corrected.reserved, 0);
  assert.equal(corrected.left, 780);
  assert.equal(corrected.runs.length, 2);
  const [closed, correction] = corrected.runs;
  assert.equal(closed.outcome, "error");
  assert.deepEqual(closed.finishedAt, later);
  assert.equal(correction.kind, "correction");
  assert.equal(correction.reason, "seed from GMP console");
  assert.equal(correction.setTo, 120);
  assert.deepEqual(correction.startedAt, later);
});

test("a correction needs a reason and a whole, non-negative count", async () => {
  await assert.rejects(budget({ set: 10, now }), /reason/);
  await assert.rejects(budget({ set: -1, reason: "x", now }), /Invalid/);
  await assert.rejects(budget({ set: 1.5, reason: "x", now }), /Invalid/);
  assert.deepEqual((await budget({ now })).runs, []);
});

test("the month turns on the 1st at 09:00 Berlin (00:00 US Pacific)", async () => {
  const before = new Date("2026-10-01T08:59:00+02:00");
  const after = new Date("2026-10-01T09:01:00+02:00");
  assert.equal((await budget({ now: before })).month, "2026-09");
  assert.equal((await budget({ now: after })).month, "2026-10");
  assert.equal(
    (await budget({ now: new Date("2026-12-15T12:00:00Z") })).resetsAt.toISOString(),
    "2027-01-01T08:00:00.000Z",
    "winter: the 1st, 00:00 Pacific is 08:00 UTC",
  );

  await seedPlaces(1);
  await plan({ dir, now: before });
  assert.equal((await budget({ now: before })).spent, 1);
  assert.equal((await budget({ now: after })).spent, 0);
});

test("a plan with nothing to look up reserves nothing and leaves no run", async () => {
  await plan({ dir, now });

  const month = await budget({ now });
  assert.equal(month.spent, 0);
  assert.equal(month.reserved, 0);
  assert.deepEqual(month.runs, []);
});
