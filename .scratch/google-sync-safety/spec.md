# Spec: Safe and economical Google sync

Status: ready-for-agent

Map: [map.md](map.md). Decisions behind this spec live in its tickets: [01 pricing and quotas](issues/01-places-pricing-and-quotas.md), [02 budget guard](issues/02-budget-guard.md), [03 Sync plan, apply, rollback](issues/03-sync-plan-and-rollback.md), [04 console quotas](issues/04-check-getplace-quotas.md), [05 Lost Google match](issues/05-not-found-places.md), [06 testing](issues/06-testing-without-google.md). Glossary: `CONTEXT.md` (Google sync, Sync plan, Applied sync, Sync budget, Lost Google match).

## Problem Statement

The Google sync is one script that, in a single run, asks Google about every Place and, with `--apply`, writes what Google says straight into the production database. For the admin this has three problems:

- **Money.** Every Place looked up is a billed Place Details Enterprise request; 1,000 a month are free for the whole billing account, and a full run is 446. Nothing stops a third run in a month, a forgotten "dry run" (which is billed too), a loop of reruns, or a leaked key. The 429 retry loop can stall for minutes. Google's own usage figures lag up to 48 hours, so the admin can't even see how much is left. Google Cloud's daily quota is still at its default of 125,000.
- **Review.** Changes reach the map without anyone looking at them. A manual correction (hours fixed by hand, a Place closed by hand) is silently overwritten by whatever Google says.
- **Undo.** There is no record of what was overwritten, so a bad run can't be reverted.

On top of that, Places whose Google Place ID Google no longer knows answer 404, which is billed, on every run, forever.

## Solution

The Google sync becomes a two-phase flow with a guarded budget:

1. `plan` asks Google about the Places and writes a **Sync plan**: a JSON file of proposed changes (one field of one Place each) plus a readable summary. It writes nothing to Places. Before sending a single request it reserves the requests it needs from the **Sync budget** (900 a month, counted in the production database, shared by every machine); if they don't fit, it refuses and says how many are left. The first 429 stops the run instead of retrying.
2. The admin reviews the summary, deletes from the JSON whatever must not be applied, and regenerates the summary if they like.
3. `apply` writes what is left, field by field, skipping any field edited since the plan was made, and records an **Applied sync**.
4. `rollback` writes the Applied sync's previous values back, again leaving alone anything edited since.

A Place that answers 404 gets a mark through the plan and becomes a **Lost Google match**: it stays on the map but is no longer looked up until the admin gives it a new Place ID. `budget` shows how much of the month is spent and lets the admin correct the count. As a second line of defence the owner sets Google Cloud's daily Place Details quota to 500.

## User Stories

### Planning

1. As the admin, I want `plan` to look up Places and write a Sync plan without touching Places, so that nothing reaches the map before I've seen it.
2. As the admin, I want the Sync plan to hold one entry per field of a Place with its current and proposed value, so that I can accept or drop each change on its own.
3. As the admin, I want the entries grouped by Place with its name, so that I can read the plan Place by Place.
4. As the admin, I want only the fields the sync owns (status, Google Place ID, opening hours, phone, website) to appear in the plan, so that name, address and location are never touched.
5. As the admin, I want a Place whose Google data matches ours to be left out of the plan, so that the plan holds only real changes.
6. As the admin, I want Places already closed and unchanged left out of the plan's entries and shown as one counter line, so that they don't drown the real changes.
7. As the admin, I want the plan to record when it was made, which database it was made from, how many Places were looked up, the `--limit` used and the field-mask version, so that I can tell plans apart and `apply` can check them.
8. As the admin, I want `plan --limit=N` to look up only the first N Places, so that I can test a change cheaply or spend only what is left of the month.
9. As the admin, I want the plan and its summary written to a dated file in an untracked folder, so that prod data never ends up in git.
10. As the admin, I want Places that answered "failed" listed in a separate information-only section, so that I know which Places weren't checked this time.

### Summary

11. As the admin, I want a readable summary next to every plan, so that I don't have to read raw JSON to review.
12. As the admin, I want the summary to open with counters (looked up, with changes, unchanged, not found, failed, skipped as Lost Google match), so that I see the size of the run at a glance.
13. As the admin, I want status changes (closures and reopenings) listed first, so that the changes that hide or show a Place get my attention first.
14. As the admin, I want Google Place ID changes listed next, so that I notice Google migrating a Place.
15. As the admin, I want opening hours shown as a per-day diff and phone and website as before → after, so that I can judge each change quickly.
16. As the admin, I want a partial plan (stopped on a 429) to say so on its first line, so that I don't mistake it for a full run.
17. As the admin, I want `summary <plan.json>` to regenerate the summary after I trim the JSON, so that the summary always matches what will be applied.
18. As the admin, I want the summary to list every Lost Google match with when it was marked and a Google Maps search link for its name and address, so that I'm reminded to fix them and can do it quickly.

### Applying

19. As the admin, I want `apply <plan.json>` to write only the entries left in the plan, so that deleting an entry means "don't apply it".
20. As the admin, I want an entry whose field still holds the plan's current value to be written, so that reviewed changes reach the map.
21. As the admin, I want an entry whose field already holds the proposed value reported as "already applied", so that rerunning `apply` is harmless.
22. As the admin, I want an entry whose field holds anything else skipped and reported as "changed since plan", so that a manual edit made after the plan is never overwritten.
23. As the admin, I want the other entries of a Place still applied when one is skipped, so that one manual edit doesn't block the rest.
24. As the admin, I want `apply` to refuse a plan made from a different database, so that a plan made against one database never writes to another.
25. As the admin, I want a warning, not a refusal, when a plan is older than 7 days, so that I notice stale data but can still apply it.
26. As the admin, I want `apply` to ignore the plan's not-found and failed sections, so that information-only sections never cause writes.
27. As the admin, I want a status change applied like any other entry, without an extra confirmation flag, so that reviewing the plan is the only gate.

### Applied sync and rollback

28. As the admin, I want `apply` to record an Applied sync with every field it actually wrote and that field's value just before the write, so that the run can be undone.
29. As the admin, I want the Applied sync written after each Place, so that a crash mid-apply still leaves a usable record.
30. As the admin, I want the skipped entries recorded in the Applied sync too, so that I can see afterwards what didn't go in and why.
31. As the admin, I want `rollback <applied.json>` to write the previous values back, so that I can undo a bad sync.
32. As the admin, I want `rollback` to leave alone any field edited again since the apply, and report it, so that undoing never destroys a newer manual edit.
33. As the admin, I want `rollback` to refuse an Applied sync from a different database, so that undo never writes to the wrong database.

### Sync budget

34. As the admin, I want every request the sync sends counted against a Sync budget of 900 a month, so that the sync never eats past Google's 1,000 free requests by accident.
35. As the admin, I want the count kept in the production database, so that runs from my laptop and from the server see the same number.
36. As the admin, I want the month counted by the US Pacific calendar, so that it resets exactly when Google's free allowance does (the 1st, 09:00 Berlin).
37. As the admin, I want 404s, server errors and network failures counted, and only 429s not counted, so that the count errs on the side of overcounting.
38. As the admin, I want `plan` to reserve the requests it needs before sending any, and refuse up front if they don't fit, so that a plan is never cut short by the budget halfway.
39. As the admin, I want the refusal to say how many requests are left and suggest `plan --limit=<left>` or waiting for the 1st, so that I know what to do next.
40. As the admin, I want two plans started at the same time from two machines to get an honest answer (one runs, one is refused if both don't fit), so that concurrent runs can't overspend.
41. As the admin, I want unused reserved requests released when a run ends, so that a run stopped early doesn't waste the month.
42. As the admin, I want a killed run to leave its reservation counted, so that a crash can make the count too high but never too low.
43. As the admin, I want the budget limit to be a constant in code, so that raising it is a deliberate commit and not a flag typed on the spot.
44. As the admin, I want each run recorded (machine, start and finish, reserved, actually sent, outcome, plan file path), so that I can tell who spent the month and find the plan file on the right machine.
45. As the admin, I want `budget` to show the month's spent, reserved and remaining requests and its runs without asking Google, so that I can check what's left for free.
46. As the admin, I want `budget --set=N --reason=…` to set the month's spent count and release reservations of runs that never finished, recorded with my reason, so that I can seed the count at rollout and clear a stuck reservation after a crash.

### Quota and 429

47. As the admin, I want the first 429 to stop the run: no new requests, in-flight ones finished, unanswered Places marked failed with reason "quota", so that a hit daily cap doesn't stall the run for minutes.
48. As the admin, I want the partial plan still written when a run stops on a 429, so that requests already paid for aren't thrown away.
49. As the owner, I want Google Cloud's `GetPlaceRequest per day` quota set to 500, so that even a bypassed budget, a bug or a leaked key can't spend more than one full run a day.
50. As the owner, I want that cap to leave Text Search alone, so that the free Place ID lookup for Place suggestions keeps working.

### Lost Google match

51. As the admin, I want a Place that answers 404 listed in the plan's not-found section with a proposed mark recording the Place ID that failed, so that marking it goes through review like any change.
52. As the admin, I want a marked Place skipped by later plans while its Google Place ID is unchanged, and left out of the reservation, so that a 404 is paid for once, not every month.
53. As the admin, I want a marked Place to stay on the map, so that a broken ID doesn't hide a coffee shop that is still open.
54. As the admin, I want changing a marked Place's Google Place ID by hand to make the next plan look it up again without clearing the mark separately, so that fixing the ID is one edit.
55. As the admin, I want to be able to delete the proposed mark from the plan, so that a Place I believe is a temporary Google glitch is looked up again next run.

### CLI and safety

56. As the admin, I want subcommands `plan`, `apply`, `rollback`, `summary`, `budget`, so that each step is explicit.
57. As the admin, I want the script with no arguments to print help and send nothing, so that running it by mistake costs nothing.
58. As the admin, I want the old `--apply` (write straight after asking Google) removed, so that there is no path that skips review.
59. As a developer, I want the subcommands callable as functions that return results, so that tests can check behaviour without parsing console output.
60. As a developer, I want the tests to fake Google at the `fetch` level, so that no test can ever send a billed request.

### Documentation

61. As the admin or an AI assistant, I want the sync guide to describe the new flow, the budget, the Lost Google match handling and the rollout checklist, so that nobody runs the old, unsafe procedure from memory.

## Implementation Decisions

### Module shape

- The sync becomes a module whose interface is five functions, one per subcommand: `plan({ limit, dir, now })`, `apply(planPath, { now })`, `rollback(appliedPath)`, `summary(planPath)`, `budget({ set, reason, now })`. They work on an already-open mongoose connection, read and write files only under the given paths and `dir`, take `now` for the clock, and return result objects (what was looked up, written, skipped, refused and why). Refusals are typed errors or result variants: budget doesn't fit; database identity mismatch.
- The existing script becomes a thin CLI: parse argv, connect to `MONGO_URI`, call the function, print the result, exit. No argument prints help. `--apply` is removed. The CLI picks the default directory `untracked/google-sync/` and file names `<datetime>-plan.json`, `<datetime>-plan.md`, `<datetime>-applied.json`.
- Kept from today's script: field mask (`id,businessStatus,regularOpeningHours.weekdayDescriptions,internationalPhoneNumber,websiteUri`), `languageCode=en`, concurrency 3, the opening-hours normalisation and comparison, order by `_id`, "Google only proposes a field when it returns a value". Removed: the 429 retry loop.

### Sync plan file

Shape from 03:

```
{
  meta: { createdAt, database: { host, name }, lookedUp, limit, fieldMaskVersion, stoppedOn?: "429" },
  places: [{ placeId, name, changes: [{ field, current, proposed }] }],
  notFound: [{ placeId, name, googleId }],
  failed: [{ placeId, name, reason }],
  skipped: [{ placeId, name, address, googleNotFoundId, markedAt }]   // Lost Google match, for the summary
}
```

- `field` is one of `businessStatus`, `googleId`, `openingHours`, `phone`, `website`, `googleNotFoundId`.
- Database identity is host plus database name parsed from `MONGO_URI`, never credentials.
- A 404 puts the Place in `notFound` and adds a change `googleNotFoundId: current null → proposed <the googleId that answered 404>`.
- `markedAt` for the summary comes from when the mark was applied (the Applied sync isn't in the database, so the Place stores the mark's date alongside it; see Schema).

### Applying and rolling back

- Per entry: database value equals `current` → write `proposed`; equals `proposed` → "already applied"; otherwise skip as "changed since plan". Comparison of opening hours uses the same normalisation as planning.
- `apply` and `rollback` refuse when the file's database identity differs from the connected database. A plan older than 7 days gives a warning in the result.
- `apply` appends to the Applied sync after each Place: written entries with `current` as read from the database at write time, and skipped entries with their reason. The Applied sync carries the plan's database identity.
- `rollback` writes each written entry's `current` back with the same per-entry check (database value must equal what was written); anything else is reported and left alone.

### Schema

- Place gains `properties.googleNotFoundId` (string, default null) and `properties.googleNotFoundAt` (date, default null), written only through `apply`/`rollback` of a plan entry (the `googleNotFoundId` entry sets both; rolling it back clears both). They are not exposed in the GraphQL schema.
- `plan` selects Places with a `googleId` where `googleNotFoundId` is not equal to `googleId`; marked Places with an unchanged ID are collected into `skipped`.
- New collection for the Sync budget month: one document per Pacific month, `{ month: "YYYY-MM", spent, reserved }`, unique on `month`.
- New collection for run records: `{ month, kind: "plan" | "correction", host, startedAt, finishedAt?, reserved, sent, outcome?: "done" | "stopped-429" | "error", planPath?, reason?, setTo? }`. A plan record with no `finishedAt` is a run that never finished.

### Sync budget

- `SYNC_BUDGET = 900`, a constant in the module.
- The month key is the calendar month in `America/Los_Angeles` of `now`.
- `plan` computes N (Places to look up after skipping Lost Google matches, capped by `--limit`). If N is 0 it sends nothing and reserves nothing. Otherwise it reserves with one atomic conditional update on the month document (upsert, condition `spent + reserved + N ≤ 900`, `$inc reserved N`); if the update matches nothing, it refuses before any request with the remaining count and the reset time.
- A request counts as sent unless it was answered 429. At the end the run moves `sent` from `reserved` to `spent` and releases the rest (`$inc spent sent, reserved -N`), and finishes its run record. On a thrown error the same finalisation runs best-effort with outcome `error`; only a killed process leaves a reservation behind.
- The first 429 stops the run: no new requests are sent, in-flight ones complete, Places not yet answered go to `failed` with reason `quota`, the plan is written with `stoppedOn: "429"`.
- `budget()` returns the month's spent, reserved, left and its run records. `budget({ set, reason })` sets `spent` to `set`, sets `reserved` to 0, closes every unfinished plan record of the month as `error`, and adds a `correction` record with the reason. It is the admin's responsibility not to run it while a plan is in flight.

### Google Cloud

- `GetPlaceRequest per day = 500` on project `berlin-coffee-f0bf8`, set by the owner by hand at rollout. Per-minute (600) stays. Text Search has its own quota rows and is unaffected.
- Rule for the doc: when the number of Places with a Google Place ID exceeds about 450, raise the cap to that number plus 10 %.

### Doc changes

`docs/google-places-sync.md` (Russian, as now) is rewritten for the new flow:

- **What the sync touches:** keep the field table; add `googleNotFoundId` / `googleNotFoundAt`; say nothing reaches Places except through `apply` of a reviewed plan.
- **How to run:** replace the flag table and examples with the subcommands, the plan → review → apply → (rollback) procedure, where files land, how to trim the JSON, `summary` to regenerate, and that no-arg prints help. Remove every mention of dry run and `--apply`. Note that `plan` runs only against the production database (tests use a fake fetch).
- **Reading the output:** replace the console-output walkthrough with the summary's sections and the meaning of "already applied" / "changed since plan".
- **Money and quotas:** keep SKU, 1,000 free, $20/1000; reset is the 1st at **00:00 US Pacific** (09:00 Berlin), not local midnight; the free allowance is shared by every project on the billing account; **404 is billed**, 429 is not; Google's billable usage per SKU is visible in the GMP console and Billing reports with up to 48 h lag (replace "Точного счётчика в консоли нет"); the Sync budget (900, `budget`, refusal, reservation, `budget --set`) is the real-time count; the daily cap of 500 and the rule for raising it; quotas are inexact.
- **429:** replace the retry section: the first 429 stops the run and the partial plan is marked.
- **Lost Google match:** replace the "Place ID not found" advice: what the mark is, that the Place stays on the map, how to fix `googleId` by hand in Mongo, how to remove a mark if Google restores the ID.
- **Closed Places:** replace "the next run overwrites a manual status" with "a status change shows up in the plan and can be dropped there".
- **Google Cloud:** the daily cap value; keep the note on `API key 2` as is.
- **For developers and AI assistants:** replace the rules: never run `plan` without the owner's go-ahead or against anything but prod, never `apply`/`rollback` without the owner's explicit go-ahead, check `budget` first, tests fake `fetch`.
- **Rollout checklist** (below) included or linked.

### Rollout checklist (owner, by hand)

1. Merge and deploy the new script; the old `--apply` is gone, so nobody can run the old flow from the server's build.
2. Google Maps Platform console → Billing / reports: read this month's Place Details Enterprise usage (lags up to 48 h; round up for any run in the last two days).
3. Run `budget --set=<that number> --reason="seed from GMP console"` against prod.
4. Google Cloud console → project `berlin-coffee-f0bf8` → Places API (New) → Quotas & System Limits → `GetPlaceRequest per day` → set **500**. Leave `GetPlaceRequest per minute` and every `SearchTextRequest` row alone.
5. Run `budget` to confirm the month's numbers, then the first `plan --limit=5` when a sync is due.

## Testing Decisions

- A good test drives the module through its five functions and checks what an admin would observe: the returned result, the plan and Applied sync files, the Places in the database, the budget documents, and the requests that reached the fake Google. No test asserts on internals (pool order, private helpers) or on summary wording.
- **Seam:** the global `fetch`, faked by a shared test helper that answers per Google Place ID with 200 + body, 404, 429 or 500 and records each call (URL, API key header, field mask). Prior art: the Text Search test in the Place suggestions tests replaces `globalThis.fetch` the same way. The real request code stays under test, including the status mapping the budget depends on.
- **Database:** the throwaway mongod and `setTestEnv()` from the existing test support, like every resolver test; plan files in a temp directory. The budget constant is not overridden; "nearly spent" is set up with `budget({ set: 890 })`.
- Required scenarios:
  1. A plan that doesn't fit is refused: no request sent, reservation unchanged.
  2. Two concurrent `plan` calls that don't fit together: exactly one is refused.
  3. After a run, `spent` equals requests sent (404 and 500 counted, 429 not); the rest of the reservation is released.
  4. The first 429 stops the run: no new requests, plan written with `stoppedOn: "429"`, unanswered Places in `failed`.
  5. A plan record without a finish shows in `budget`; `budget --set` clears its reservation.
  6. Month boundary: `now` on the 1st at 08:59 Berlin belongs to the old month, 09:01 to the new one.
  7. A 404 yields a `notFound` item and a `googleNotFoundId` entry; after applying it the next `plan` skips the Place and leaves it out of the reservation; after the `googleId` changes it is looked up again.
  8. `apply` per entry: matches `current` → written; equals `proposed` → "already applied"; otherwise "changed since plan", and the Place's other entries still apply.
  9. `rollback` restores values and leaves fields edited since alone.
  10. `apply` and `rollback` refuse a file from a different database identity.
  11. A plan older than 7 days applies with a warning.
- Not covered: summary wording, the CLI wrapper, a process killed mid-`apply`.

## Out of Scope

- Running the Google sync on a schedule (cron, GitHub Actions).
- Reviewing the Sync plan in the frontend admin; no GraphQL changes.
- Per-field pinning of manual edits.
- `plan --limit` choosing the least recently checked Places first.
- Automatically searching for a new Place ID for a Lost Google match (free Text Search candidates were considered and dropped).
- Guarding runs against a non-production database.
- Cleaning up the unrestricted old `API key 2`.
- Any change in Google Cloud made by the implementing agent; the quota is the owner's checklist item.

## Further Notes

- Decisions made while writing this spec, not in a ticket: the `skipped` section in the plan; `googleNotFoundAt` stored next to `googleNotFoundId` so the summary can show when a Place was marked; best-effort finalisation with outcome `error` on a thrown exception; `budget --set` also zeroes `reserved` and closes unfinished runs. Revisit any of these at ticketing if they don't fit.
- No request to Google and no write to the production database is needed to implement or test this; the first real `plan` happens after the rollout checklist, with the owner's go-ahead.
- How many Places are Lost Google matches today is unknown; the first `plan` after rollout pays for them once.
