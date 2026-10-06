import { config } from "../config/config.js";
import mongoose from "mongoose";
import { apply, berlinTime, budget, plan, rollback, summary, SYNC_BUDGET, SyncBudgetRefusal } from "./googleSync.js";

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
                       ${DEFAULT_DIR}/<datetime>-plan.json, with a readable summary
                       in <datetime>-plan.md beside it. Writes nothing to Places.
                       --limit=N looks up only the first N Places by _id.
                       Refused up front if the lookups don't fit in this month's
                       Sync budget (${SYNC_BUDGET} per US Pacific month); stops on the first 429.
  summary <plan.json>  Regenerate the plan's .md summary from the JSON, e.g. after
                       trimming entries. Needs no database and asks Google nothing.
  apply <plan.json>    Write what is left in a reviewed Sync plan to Places, skipping
                       fields edited since the plan, and record an Applied sync in
                       <datetime>-applied.json next to the plan. Sends nothing to Google.
  rollback <applied.json>
                       Write back the values an Applied sync replaced, leaving alone
                       fields edited since the apply. Sends nothing to Google.
  budget               Show this month's Sync budget (spent, reserved, left) and
                       its runs. Asks Google nothing.
  budget --set=N --reason="…"
                       Set this month's spent count to N, release every
                       reservation and close unfinished runs. For seeding the
                       count at rollout and after a crashed run.

Guide: docs/google-places-sync.md`;

type Command =
  | { name: "help" }
  | { name: "plan"; limit?: number }
  | { name: "apply"; planPath: string }
  | { name: "rollback"; appliedPath: string }
  | { name: "summary"; planPath: string }
  | { name: "budget"; set?: number; reason?: string };

const parseBudget = (options: string[]): Command => {
  let set: number | undefined;
  let reason: string | undefined;
  for (const option of options) {
    const setMatch = option.match(/^--set=(\d+)$/);
    const reasonMatch = option.match(/^--reason=(.+)$/s);
    if (setMatch) set = Number(setMatch[1]);
    else if (reasonMatch?.[1].trim()) reason = reasonMatch[1];
    else throw new Error(`Unknown or invalid option for budget: ${option}`);
  }
  if ((set === undefined) !== (reason === undefined)) {
    throw new Error("budget: --set and --reason go together");
  }
  return { name: "budget", set, reason };
};

const parse = (args: string[]): Command => {
  const [subcommand, ...options] = args;
  if (subcommand === undefined) return { name: "help" };
  if (subcommand === "budget") return parseBudget(options);

  const theFile = (what: string) => {
    if (options.length !== 1 || options[0].startsWith("-")) {
      throw new Error(`${subcommand} takes exactly one argument: the ${what}`);
    }
    return options[0];
  };
  if (subcommand === "apply") return { name: "apply", planPath: theFile("plan file") };
  if (subcommand === "rollback") return { name: "rollback", appliedPath: theFile("Applied sync file") };
  if (subcommand === "summary") return { name: "summary", planPath: theFile("plan file") };

  if (subcommand !== "plan") throw new Error(`Unknown subcommand: ${subcommand}`);

  let limit: number | undefined;
  for (const option of options) {
    const match = option.match(/^--limit=(\d+)$/);
    if (!match || Number(match[1]) < 1) throw new Error(`Unknown or invalid option for plan: ${option}`);
    limit = Number(match[1]);
  }
  return { name: "plan", limit };
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

const runPlan = async (limit?: number) => {
  let result: Awaited<ReturnType<typeof plan>>;
  try {
    result = await plan({ limit, dir: DEFAULT_DIR, now: new Date() });
  } catch (error) {
    if (!(error instanceof SyncBudgetRefusal)) throw error;
    console.error(`Refused, nothing sent. ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const { path, syncPlan } = result;
  if (syncPlan.meta.stoppedOn) {
    console.log("PARTIAL PLAN: Google answered 429, the run stopped; unanswered Places are failed (quota).\n");
  }
  const { lookedUp, notSent = 0 } = syncPlan.meta;
  console.log(
    notSent
      ? `Looked up ${lookedUp - notSent} of ${lookedUp} selected Places (${notSent} not sent, stopped on 429)`
      : `Looked up ${lookedUp} Places`,
  );
  const notFoundIds = new Set(syncPlan.notFound.map(({ placeId }) => placeId));
  console.log(`  with changes: ${syncPlan.places.filter(({ placeId }) => !notFoundIds.has(placeId)).length}`);
  console.log(`  not found:    ${syncPlan.notFound.length}`);
  console.log(`  failed:       ${syncPlan.failed.length}`);
  console.log(`Skipped as Lost Google match: ${syncPlan.skipped?.length ?? 0}`);
  console.log(`\nSync plan: ${path}`);
  console.log(`Summary:   ${result.summaryPath}`);
  for (const warning of result.warnings) {
    console.warn(`\nWarning: ${warning} The plan above is complete: review it, don't run plan again.`);
  }
};

const runBudget = async ({ set, reason }: { set?: number; reason?: string }) => {
  const month = await budget({ set, reason, now: new Date() });
  console.log(`Sync budget ${month.month} (US Pacific): ${month.spent} spent, ${month.reserved} reserved, ${month.left} of ${month.budget} left`);
  console.log(`Resets ${month.resetsAt.toISOString()} (${berlinTime(month.resetsAt)})`);
  if (!month.runs.length) return console.log("\nNo runs this month.");
  console.log("\nRuns:");
  for (const run of month.runs) {
    const started = run.startedAt.toISOString();
    if (run.kind === "correction") {
      console.log(`  ${started}  correction on ${run.host}: spent set to ${run.setTo} (${run.reason})`);
    } else {
      const end = run.finishedAt
        ? `${run.outcome}, sent ${run.sent} of ${run.reserved} reserved`
        : `NOT FINISHED, holds ${run.reserved} reserved`;
      console.log(`  ${started}  plan on ${run.host}: ${end}${run.planPath ? `, ${run.planPath}` : ""}`);
    }
  }
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
  // The summary is made from the plan file alone: no database connection.
  if (command.name === "summary") {
    const { path } = await summary(command.planPath);
    return console.log(`Summary: ${path}`);
  }

  await mongoose.connect(config.mongoUri);
  try {
    if (command.name === "plan") await runPlan(command.limit);
    else if (command.name === "apply") await runApply(command.planPath);
    else if (command.name === "rollback") await runRollback(command.appliedPath);
    else await runBudget(command);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
