# 11: Readable summary next to every plan, and the `summary` subcommand

Status: done

**Spec:** [spec.md](../spec.md) (Solution, user stories "Summary"). Decisions: [Sync plan shape, applying it, and rolling it back](03-sync-plan-and-rollback.md).

**What to build:** next to every Sync plan the admin gets a Markdown summary to review instead of raw JSON, and after trimming the JSON can regenerate it with `summary <plan.json>` so it always matches what `apply` will write.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand), 08 (Sync budget: reservation, refusal, first-429 stop, and the `budget` subcommand) for the `stoppedOn` line.

- [x] `plan` writes `<datetime>-plan.md` beside the JSON, generated from the JSON only.
- [x] Order: a first line when `meta.stoppedOn` is set ("partial plan: stopped on 429"); counters (looked up / with changes / unchanged / not found / failed); status changes (closures and reopenings); `googleId` changes; other changes per Place (opening hours as a per-day diff, phone and website as before → after); not found and failed; already-closed-unchanged as one counter line.
- [x] `summary(planPath)` rewrites the `.md` from the (possibly trimmed) JSON; CLI `summary <plan.json>`.
- [x] Tests: after deleting a change from the JSON, `summary` produces a file without it; a plan with `stoppedOn` gets the partial-plan line first. Wording beyond that is not asserted.

## Comments

- 2026-10-06: Done on `feat/gss-11-summary`.
  - `src/scripts/googleSync.ts` exports `summary(planPath)`, which returns `{ path, markdown }` and writes `<name>.md` beside `<name>.json` from the plan file alone (no database, no Google). `plan` calls it right after writing the JSON and now returns `{ path, summaryPath, syncPlan }`. The CLI `summary <plan.json>` runs without connecting to Mongo (checked by hand with an unreachable `MONGO_URI`); `summary` without exactly one argument prints an error plus help and exits 1. `plan` prints the summary path; help lists the subcommand.
  - Summary order: the partial-plan line first when `meta.stoppedOn` is set; title and plan meta (made at, database, `--limit`); counters looked up / with changes / unchanged / not found / failed; status changes (closures, then reopenings); `googleId` changes; other changes per Place (opening hours as a per-day diff of only the days that differ, phone and website as before → after); not found; failed; "Already closed and unchanged: N" last. An empty section says "None.".
  - Decisions within the ticket:
    - The already-closed counter can't be derived from the JSON, so the plan gained `meta.closedUnchanged`: Places Google answered for with no changes whose stored status is `CLOSED_TEMPORARILY` or `CLOSED_PERMANENTLY`. It is optional in the type; the summary leaves the line out for a plan without it. These Places are also included in "unchanged".
    - "Unchanged" is computed as `lookedUp − with changes − not found − failed`, where "with changes" counts Places with at least one change left. A Place whose every change was trimmed from the JSON therefore counts as unchanged, matching what `apply` will do.
    - The `.md` name is the plan's file name with `.json` replaced, so `summary` on a renamed plan writes next to it under the matching name.
  - Existing tests adjusted: the plan folder now holds `-plan.json` and `-plan.md` (`googleSyncPlan.test.ts`), `meta` includes `closedUnchanged: 0`, and the "no Applied sync file" check in `googleSyncApply.test.ts` filters for `-applied.json` instead of expecting the folder to hold only the plan.
  - For 12: add the `skipped` section to `renderSummary` (counter "skipped as Lost Google match" with the others, and a list with `markedAt` and a Google Maps search link `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(name + ", " + address)>`). `summary` already reads only the JSON, so `skipped` just needs to be in `SyncPlan`. The `googleNotFoundId` change entry would currently land under "Other changes" as before → after; consider listing it with Not found instead.
  - For 13: the doc should describe the summary's sections, that the `.md` is regenerated with `summary <plan.json>` after trimming, and that `summary` needs no database.
  - Tests: `tests/googleSyncSummary.test.ts`, 4 tests (a trimmed change disappears after `summary`; a 429-stopped plan opens with the partial-plan line; a full plan doesn't; `summary` works with the Places gone and asks Google nothing). Wording is not asserted. `googleSyncPlan.test.ts` asserts `meta.closedUnchanged`. Full suite 357/357, `tsc --noEmit` clean for `tsconfig.json` and `tsconfig.build.json`. No request was sent to Google, and nothing was run against a real database.
