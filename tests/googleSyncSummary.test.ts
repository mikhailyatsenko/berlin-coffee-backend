/**
 * Google sync summary: the readable `<datetime>-plan.md` written next to every
 * Sync plan, and `summary` regenerating it from a trimmed plan. Against a
 * throwaway mongod and a fake Google. Wording is not asserted, only what the
 * admin relies on: a change trimmed from the JSON is gone from the summary,
 * and a partial plan says so on its first line.
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
const { default: SyncBudgetMonth } = await import("../src/models/SyncBudgetMonth.js");
const { default: SyncRun } = await import("../src/models/SyncRun.js");
const { plan, summary } = await import("../src/scripts/googleSync.js");

const google = useFakeGoogle();
useThrowawayMongod();

const now = new Date("2026-10-06T12:34:56.789Z");
let dir: string;

beforeEach(async () => {
  google.reset();
  await Place.deleteMany({});
  await SyncBudgetMonth.deleteMany({});
  await SyncRun.deleteMany({});
  dir = mkdtempSync(path.join(tmpdir(), "coffemap-google-sync-summary-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedPlace(name: string, properties: Record<string, unknown> = {}) {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name, address: `${name} Str. 1, Berlin`, googleId: `g-${name}`, ...properties },
  });
  return place._id.toString();
}

const summaryPathOf = (planPath: string) => planPath.replace(/\.json$/, ".md");

test("plan writes a summary next to the JSON; after a change is trimmed, summary drops it", async () => {
  await seedPlace("Bonanza", { phone: "+49 30 1111", website: "https://old.example" });
  google.place("g-Bonanza", {
    internationalPhoneNumber: "+49 30 2222",
    websiteUri: "https://new-bonanza.example",
  });

  const { path: planPath } = await plan({ dir, now });
  const mdPath = summaryPathOf(planPath);
  const before = readFileSync(mdPath, "utf8");
  assert.match(before, /\+49 30 2222/);
  assert.match(before, /new-bonanza\.example/);

  // The admin drops the website change from the JSON and regenerates.
  const syncPlan = JSON.parse(readFileSync(planPath, "utf8"));
  syncPlan.places[0].changes = syncPlan.places[0].changes.filter(
    (change: { field: string }) => change.field !== "website",
  );
  writeFileSync(planPath, JSON.stringify(syncPlan, null, 2));

  const result = await summary(planPath);

  assert.equal(result.path, mdPath);
  const after = readFileSync(mdPath, "utf8");
  assert.equal(after, result.markdown);
  assert.match(after, /\+49 30 2222/);
  assert.doesNotMatch(after, /new-bonanza\.example/);
});

test("a plan stopped on a 429 says it is partial on the summary's first line", async () => {
  await seedPlace("First");
  google.status("g-First", 429);
  await seedPlace("Second");
  google.place("g-Second", { internationalPhoneNumber: "+49 30 3333" });

  const { path: planPath, syncPlan } = await plan({ dir, now });
  assert.equal(syncPlan.meta.stoppedOn, "429");

  const [firstLine] = readFileSync(summaryPathOf(planPath), "utf8").split("\n");
  assert.match(firstLine, /partial/i);
  assert.match(firstLine, /429/);
});

test("a full plan's summary does not open with the partial-plan line", async () => {
  await seedPlace("Calm");
  google.place("g-Calm", { internationalPhoneNumber: "+49 30 4444" });

  const { path: planPath } = await plan({ dir, now });

  const [firstLine] = readFileSync(summaryPathOf(planPath), "utf8").split("\n");
  assert.doesNotMatch(firstLine, /partial/i);
});

test("summary needs only the plan file: it works with the Places gone from the database", async () => {
  await seedPlace("Elsewhere", { businessStatus: "OPERATIONAL" });
  google.place("g-Elsewhere", { businessStatus: "CLOSED_PERMANENTLY" });
  const { path: planPath } = await plan({ dir, now });
  const callsAfterPlan = google.calls.length;
  await Place.deleteMany({});

  const { markdown } = await summary(planPath);

  assert.match(markdown, /Elsewhere/);
  assert.match(markdown, /CLOSED_PERMANENTLY/);
  assert.equal(google.calls.length, callsAfterPlan, "summary asks Google nothing");
});
