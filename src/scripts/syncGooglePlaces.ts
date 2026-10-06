import { config } from "../config/config.js";
import mongoose from "mongoose";
import { plan } from "./googleSync.js";

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

Guide: docs/google-places-sync.md`;

type Command = { name: "help" } | { name: "plan"; limit?: number };

const parse = (args: string[]): Command => {
  const [subcommand, ...options] = args;
  if (subcommand === undefined) return { name: "help" };
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
    const { path, plan: result } = await plan({
      limit: command.limit,
      dir: DEFAULT_DIR,
      now: new Date(),
    });
    console.log(`Looked up ${result.meta.lookedUp} Places`);
    console.log(`  with changes: ${result.places.length}`);
    console.log(`  not found:    ${result.notFound.length}`);
    console.log(`  failed:       ${result.failed.length}`);
    console.log(`\nSync plan: ${path}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
