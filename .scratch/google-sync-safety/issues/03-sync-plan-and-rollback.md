# Sync plan shape, applying it, and rolling it back

Type: grilling
Status: resolved
Blocked by:

## Question

What exactly is a Sync plan and how is it written to the database and undone?

- Contents per entry: Place id and name, field, current value, proposed value; where closed and "not found" Places sit in it; the run's metadata (date, Places looked up).
- The readable summary that accompanies it: what it groups and highlights (closures first?).
- Applying: entries whose current value in the database no longer matches the plan's "current" (edited since) are skipped and reported, or overwritten? Does a plan expire after some days?
- Rollback: is the applied plan itself the backup (write the "current" values back), or is a separate export of the touched Places taken before writing? Where these files live (they hold prod data; not in git).
- CLI shape: flags or subcommands for "make plan", "apply plan", "roll back", and what `--limit` means in the new flow.
- Places Google answers "not found" for: each such lookup is billed (01), so they cost money every month. Does the plan surface them as a to-do for the admin (fix the Place ID or hide the Place), and should later runs skip them until fixed?

## Answer

Resolved by grilling with the owner, 2026-10-06. Glossary: **Sync plan** sharpened, **Applied sync** added in `CONTEXT.md`.

**Sync plan (JSON).** One entry = one field of one Place, grouped by Place:
`places: [{ placeId, name, changes: [{ field, current, proposed }] }]`. Fields: `businessStatus`, `googleId`, `openingHours`, `phone`, `website`. Deleting a `changes` item means "don't apply it"; a Place left with no changes is skipped. Places Google answers 404 for and failed requests sit in separate `notFound: [...]` and `failed: [...]` sections, information only; `apply` ignores them. A status change is an ordinary entry (no extra confirmation flag); Places already closed with no change are not in the plan.

**Metadata:** created-at, database identity (host + db name from `MONGO_URI`, no credentials), number of Places looked up, `--limit`, field-mask version.

**Summary (`…-plan.md`)**, generated from the JSON, read-only, in this order: counters (looked up / with changes / unchanged / not found / failed); status changes (closures and reopenings); `googleId` changes; other changes per Place (hours as per-day diff, phone and website as before → after); not found and failed; already-closed-unchanged as one counter line. `summary <plan.json>` regenerates it after the JSON is trimmed.

**Applying.** Per entry: if the database value equals the plan's `current`, write `proposed`; if it already equals `proposed`, report "already applied"; otherwise skip and report "changed since plan". Other entries still apply. Plan older than 7 days: warning only, never refusal. `apply` and `rollback` refuse when the plan's database identity doesn't match the current `MONGO_URI`.

**Applied sync (rollback source).** `apply` writes `…-applied.json`, appended after each Place (survives a crash mid-run): only entries actually written, with `current` as read from the database at write time, plus the skipped entries. `rollback <applied.json>` writes those values back with the same per-entry check (a field edited since is left alone and reported). No full-document export, no `mongodump`.

**Files:** `untracked/google-sync/<datetime>-plan.json`, `…-plan.md`, `…-applied.json` (`untracked` is already gitignored). Paths passed explicitly to `apply` / `rollback`.

**CLI:** subcommands `plan [--limit=N]`, `apply <plan.json>`, `rollback <applied.json>`, `summary <plan.json>`. No arguments prints help (today no-arg is a billed dry run). The old `--apply` (write straight after querying Google) is removed. `--limit` stays only on `plan` and keeps today's meaning: first N Places by `_id`.

**Handed to "Budget guard":** whether `--limit` should instead pick the Places checked least recently (so limited runs cover everyone over time) belongs with "shrink to what is left"; if the budget counter lives in a database collection, revisit keeping plans there too.
