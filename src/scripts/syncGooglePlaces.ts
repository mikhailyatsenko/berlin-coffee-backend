import { config } from "../config/config.js";
import mongoose from "mongoose";
import { apply, plan, rollback } from "./googleSync.js";

/**
 * The Google sync CLI: parses arguments, connects to MONGO_URI, calls the
 * googleSync module and prints what it did. No arguments print help.
 *
 * Only run it with the owner's go-ahead: every Place looked up is billed, and
 * `apply` and `rollback` write to the database MONGO_URI points at.
 * Full guide, costs and pitfalls: docs/google-places-sync.md
 */

const DEFAULT_DIR = "untracked/google-sync";

const HELP = `Google sync. Every Place looked up is billed; run only with the owner's go-ahead.

Usage: node dist/scripts/syncGooglePlaces.js <subcommand> [options]

Subcommands:
  plan [--limit=N]     Look up Places in Google and write a Sync plan to
                       ${DEFAULT_DIR}/<datetime>-plan.json. Writes nothing to Places.
                       --limit=N looks up only the first N Places by _id.
  apply <plan.json>    Write what is left in a reviewed Sync plan to Places, skipping
                       fields edited since the plan, and record an Applied sync in
                       <datetime>-applied.json next to the plan. Sends nothing to Google.
  rollback <applied.json>
                       Write back the values an Applied sync replaced, leaving alone
                       fields edited since the apply. Sends nothing to Google.

Guide: docs/google-places-sync.md`;

type Command =
  | { name: "help" }
  | { name: "plan"; limit?: number }
  | { name: "apply"; planPath: string }
  | { name: "rollback"; appliedPath: string };

const parse = (args: string[]): Command => {
  const [subcommand, ...options] = args;
  if (subcommand === undefined) return { name: "help" };

  if (subcommand === "apply") {
    if (options.length !== 1 || options[0].startsWith("-")) {
      throw new Error("apply takes exactly one argument: the plan file");
    }
    return { name: "apply", planPath: options[0] };
  }

  if (subcommand === "rollback") {
    if (options.length !== 1 || options[0].startsWith("-")) {
      throw new Error("rollback takes exactly one argument: the Applied sync file");
    }
    return { name: "rollback", appliedPath: options[0] };
  }

  if (subcommand !== "plan") throw new Error(`Unknown subcommand: ${subcommand}`);

  let limit: number | undefined;
  for (const option of options) {
    const match = option.match(/^--limit=(\d+)$/);
    if (!match || Number(match[1]) < 1) throw new Error(`Unknown or invalid option for plan: ${option}`);
    limit = Number(match[1]);
  }
  return { name: "plan", limit };
};

const runPlan = async (limit: number | undefined) => {
  const { path, syncPlan } = await plan({ limit, dir: DEFAULT_DIR, now: new Date() });
  console.log(`Looked up ${syncPlan.meta.lookedUp} Places`);
  console.log(`  with changes: ${syncPlan.places.length}`);
  console.log(`  not found:    ${syncPlan.notFound.length}`);
  console.log(`  failed:       ${syncPlan.failed.length}`);
  console.log(`\nSync plan: ${path}`);
};

const runApply = async (planPath: string) => {
  const { path, appliedSync, warnings } = await apply(planPath, { now: new Date() });
  for (const warning of warnings) console.warn(`Warning: ${warning}`);

  for (const { name, field, current, proposed } of appliedSync.written) {
    console.log(`written          ${name}: ${field} ${JSON.stringify(current)} -> ${JSON.stringify(proposed)}`);
  }
  for (const { name, field, reason } of appliedSync.skipped) {
    console.log(`${reason.padEnd(17)}${name}: ${field}`);
  }
  const count = (reason: string) => appliedSync.skipped.filter((entry) => entry.reason === reason).length;
  console.log(`\nWritten: ${appliedSync.written.length}`);
  console.log(`Already applied: ${count("already applied")}`);
  console.log(`Changed since plan (skipped): ${count("changed since plan")}`);
  console.log(`\nApplied sync: ${path}`);
};

const runRollback = async (appliedPath: string) => {
  const { restored, leftAlone } = await rollback(appliedPath);
  for (const { name, field, replaced, restored: value } of restored) {
    console.log(`restored             ${name}: ${field} ${JSON.stringify(replaced)} -> ${JSON.stringify(value)}`);
  }
  for (const { name, field, reason } of leftAlone) {
    console.log(`${reason.padEnd(21)}${name}: ${field}`);
  }
  console.log(`\nRestored: ${restored.length}`);
  console.log(`Changed since apply (left alone): ${leftAlone.length}`);
};

const main = async () => {
  let command: Command;
  try {
    command = parse(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${HELP}`);
    process.exit(1);
  }
  if (command.name === "help") return console.log(HELP);

  await mongoose.connect(config.mongoUri);
  try {
    if (command.name === "plan") await runPlan(command.limit);
    else if (command.name === "apply") await runApply(command.planPath);
    else await runRollback(command.appliedPath);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
