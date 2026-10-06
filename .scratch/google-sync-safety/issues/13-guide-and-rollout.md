# 13: Rewrite the Google sync guide and the rollout checklist

Status: done

**Spec:** [spec.md](../spec.md) (Doc changes, Rollout checklist). Corrections: branch `research/places-pricing-and-quotas`, section "Corrections to `docs/google-places-sync.md`".

**What to build:** the Google sync guide (Russian, as now) describes the new flow, so neither the admin nor an AI assistant runs the old procedure from memory, and it carries the owner's rollout checklist. Documentation only: nothing is changed in Google Cloud, no request to Google, no write to production.

**Blocked by:** 07, 08, 09, 10, 11, 12 (the whole new flow).

- [x] Every point of the spec's "Doc changes" section is done: field table with the Lost Google match fields; plan → review → apply → rollback procedure with the subcommands and file locations; reading the summary; money and quotas (00:00 US Pacific reset, 404 billed, allowance shared across the billing account, GMP console usage with 48 h lag, Sync budget and `budget`, daily cap 500 and the rule to raise it); 429 stops the run; Lost Google match handling; closed Places via the plan; developer and AI-assistant rules.
- [x] No mention of dry run or `--apply` remains.
- [x] The rollout checklist from the spec is in the guide: deploy; read this month's Place Details Enterprise usage in the GMP console; `budget --set=<it> --reason=…`; `GetPlaceRequest per day = 500` on `berlin-coffee-f0bf8` (per-minute and Text Search rows untouched); `budget` to confirm; first `plan --limit=5` only with the owner's go-ahead.
- [x] The guide states that `plan` runs only against production and only after this checklist.

## Comments

- 2026-10-06: Done on `docs/gss-13-guide-and-rollout`.
  - `docs/google-places-sync.md` rewritten (Russian) to match `src/scripts/googleSync.ts` and the CLI help: two-phase overview; field table with `googleNotFoundId`/`googleNotFoundAt` and the plan's field names; subcommand table (Google / database per subcommand); file locations `untracked/google-sync/<datetime>-plan.json|.md|-applied.json`; plan → review → trim → `summary` → apply → rollback procedure with "written" / "already applied" / "changed since plan" / "changed since apply"; database-identity refusal and 7-day warning; summary sections in the order `renderSummary` writes them; money and quotas (00:00 US Pacific reset, 404 billed, allowance shared across the billing account, GMP console / Billing reports with up to 48 h lag, Sync budget 900 with reservation, refusal before any request, `budget` and `budget --set`, daily cap 500 and the "> ~450 Places → count + 10 %" rule, inexact quotas); 429 stops the run; Lost Google match (stays on the map, fix `googleId` by hand, drop the mark from the plan, remove a mark by nulling both fields); closed Places via "Status changes"; Google Cloud quota values; rollout checklist; developer and AI-assistant rules. The guide says `plan` runs only against production, only after the checklist and with the owner's go-ahead.
  - No mention of dry run or `--apply` is left in the guide.
  - Also fixed: `README.md` Scripts line (was "Every run is billed"; now names `plan`/`apply` and the rollout checklist) and the header comment of `src/scripts/repairReviewPhotoCounts.ts` (referred to `syncGooglePlaces`'s `--apply`).
  - Nothing changed in Google Cloud, no request to Google, no connection to any real database; `plan` was not run.
