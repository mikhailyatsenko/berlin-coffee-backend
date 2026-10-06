# 13: Rewrite the Google sync guide and the rollout checklist

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Doc changes, Rollout checklist). Corrections: branch `research/places-pricing-and-quotas`, section "Corrections to `docs/google-places-sync.md`".

**What to build:** the Google sync guide (Russian, as now) describes the new flow, so neither the admin nor an AI assistant runs the old procedure from memory, and it carries the owner's rollout checklist. Documentation only: nothing is changed in Google Cloud, no request to Google, no write to production.

**Blocked by:** 07, 08, 09, 10, 11, 12 (the whole new flow).

- [ ] Every point of the spec's "Doc changes" section is done: field table with the Lost Google match fields; plan → review → apply → rollback procedure with the subcommands and file locations; reading the summary; money and quotas (00:00 US Pacific reset, 404 billed, allowance shared across the billing account, GMP console usage with 48 h lag, Sync budget and `budget`, daily cap 500 and the rule to raise it); 429 stops the run; Lost Google match handling; closed Places via the plan; developer and AI-assistant rules.
- [ ] No mention of dry run or `--apply` remains.
- [ ] The rollout checklist from the spec is in the guide: deploy; read this month's Place Details Enterprise usage in the GMP console; `budget --set=<it> --reason=…`; `GetPlaceRequest per day = 500` on `berlin-coffee-f0bf8` (per-minute and Text Search rows untouched); `budget` to confirm; first `plan --limit=5` only with the owner's go-ahead.
- [ ] The guide states that `plan` runs only against production and only after this checklist.
