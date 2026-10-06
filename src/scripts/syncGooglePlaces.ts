import { config } from "../config/config.js";
import mongoose from "mongoose";
import { budget, plan, SYNC_BUDGET, SyncBudgetRefusal } from "./googleSync.js";

/**
 * The Google sync CLI: parses arguments, connects to MONGO_URI, calls the
 * googleSync module and prints what it did. No arguments print help.
 *
 * Only run it with the owner's go-ahead: every Place looked up is billed.
 * Full guide, costs and pitfalls: docs/google-places-sync.md
 */

const DEFAULT_DIR = "untracked/google-sync";

const HELP = `Google sync. Every Place looked up is billed; run only with the owner's go-ahead.

Usage: node dist/scripts/syncGooglePlaces.js <subcommand> [options]

Subcommands:
  plan [--limit=N]   Look up Places in Google and write a Sync plan to
                     ${DEFAULT_DIR}/<datetime>-plan.json. Writes nothing to Places.
                     --limit=N looks up only the first N Places by _id.
                     Refused up front if the lookups don't fit in this month's
                     Sync budget (${SYNC_BUDGET} per US Pacific month); stops on the first 429.
  budget             Show this month's Sync budget (spent, reserved, left) and
                     its runs. Asks Google nothing.
  budget --set=N --reason="…"
                     Set this month's spent count to N, release every
                     reservation and close unfinished runs. For seeding the
                     count at rollout and after a crashed run.

Guide: docs/google-places-sync.md`;

type Command =
  | { name: "help" }
  | { name: "plan"; limit?: number }
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
  if (subcommand !== "plan") throw new Error(`Unknown subcommand: ${subcommand}`);

  let limit: number | undefined;
  for (const option of options) {
    const match = option.match(/^--limit=(\d+)$/);
    if (!match || Number(match[1]) < 1) throw new Error(`Unknown or invalid option for plan: ${option}`);
    limit = Number(match[1]);
  }
  return { name: "plan", limit };
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
    if (command.name === "budget") await runBudget(command);
    else await runPlan(command.limit);
  } finally {
    await mongoose.disconnect();
  }
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
  console.log(`Looked up ${syncPlan.meta.lookedUp} Places`);
  console.log(`  with changes: ${syncPlan.places.length}`);
  console.log(`  not found:    ${syncPlan.notFound.length}`);
  console.log(`  failed:       ${syncPlan.failed.length}`);
  console.log(`\nSync plan: ${path}`);
};

const runBudget = async ({ set, reason }: { set?: number; reason?: string }) => {
  const month = await budget({ set, reason, now: new Date() });
  console.log(`Sync budget ${month.month} (US Pacific): ${month.spent} spent, ${month.reserved} reserved, ${month.left} of ${month.budget} left`);
  console.log(`Resets ${month.resetsAt.toISOString()} (the 1st, 09:00 Berlin)`);
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

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
