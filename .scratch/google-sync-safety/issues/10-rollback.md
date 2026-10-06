# 10: Rolling back from an Applied sync

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Applying and rolling back, Testing Decisions scenarios 9, 10).

**What to build:** when an applied Google sync turns out wrong, the admin runs `rollback <applied.json>` and every field it wrote gets its previous value back, except fields edited again since, which are left alone and reported.

**Blocked by:** 09 (Applying a Sync plan and recording the Applied sync).

- [ ] For each written entry: database value equals what `apply` wrote → write the recorded previous value back; otherwise leave it and report "changed since apply".
- [ ] Skipped entries in the Applied sync are ignored.
- [ ] Typed refusal when the Applied sync's database identity differs from the connected database.
- [ ] `rollback(appliedPath)` returns restored / left alone per entry; CLI `rollback <applied.json>` prints it.
- [ ] Tests: (9) values restored, a field edited after the apply left alone and reported; (10) refusal on a different database identity.
