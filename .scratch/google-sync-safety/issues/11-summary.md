# 11: Readable summary next to every plan, and the `summary` subcommand

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Solution, user stories "Summary"). Decisions: [Sync plan shape, applying it, and rolling it back](03-sync-plan-and-rollback.md).

**What to build:** next to every Sync plan the admin gets a Markdown summary to review instead of raw JSON, and after trimming the JSON can regenerate it with `summary <plan.json>` so it always matches what `apply` will write.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand), 08 (Sync budget: reservation, refusal, first-429 stop, and the `budget` subcommand) for the `stoppedOn` line.

- [ ] `plan` writes `<datetime>-plan.md` beside the JSON, generated from the JSON only.
- [ ] Order: a first line when `meta.stoppedOn` is set ("partial plan: stopped on 429"); counters (looked up / with changes / unchanged / not found / failed); status changes (closures and reopenings); `googleId` changes; other changes per Place (opening hours as a per-day diff, phone and website as before → after); not found and failed; already-closed-unchanged as one counter line.
- [ ] `summary(planPath)` rewrites the `.md` from the (possibly trimmed) JSON; CLI `summary <plan.json>`.
- [ ] Tests: after deleting a change from the JSON, `summary` produces a file without it; a plan with `stoppedOn` gets the partial-plan line first. Wording beyond that is not asserted.
