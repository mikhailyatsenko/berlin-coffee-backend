# 09: Applying a Sync plan and recording the Applied sync

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Applying and rolling back, Testing Decisions scenarios 8, 10, 11). Decisions: [Sync plan shape, applying it, and rolling it back](03-sync-plan-and-rollback.md).

**What to build:** after reviewing and trimming a Sync plan, the admin runs `apply <plan.json>` and only what is left in it reaches Places, without ever overwriting a field edited since the plan was made. Every write is recorded in an Applied sync file so it can be undone.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand).

- [ ] Per entry: database value equals `current` → write `proposed`; equals `proposed` → "already applied"; otherwise skip as "changed since plan". Opening hours compare with the same normalisation as `plan`. A Place's other entries still apply when one is skipped.
- [ ] `notFound` and `failed` sections are ignored.
- [ ] Typed refusal when the plan's database identity differs from the connected database; nothing written.
- [ ] A plan older than 7 days (by `now`) applies with a warning in the result.
- [ ] `<datetime>-applied.json` next to the plan, appended after each Place: the plan's database identity, written entries with `current` as read at write time, skipped entries with their reason.
- [ ] `apply(planPath, { now })` returns written / already applied / skipped per entry; CLI `apply <plan.json>` prints it.
- [ ] Tests: (8) the three per-entry outcomes, other entries of the Place still applied; (10) refusal on a different database identity; (11) old plan applies with a warning; the Applied sync file holds what was written with previous values.
