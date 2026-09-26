# CLAUDE.md

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Frontend

The client lives in a separate repo, checked out locally as a sibling directory: `../berlincoffeemap` (GitHub: `mikhailyatsenko/coffeemapberlin`). React + Vite + Apollo Client. It talks to this API over GraphQL; when a schema change here (`src/graphql/typeDefs/`) alters an operation the client uses, the client-side change goes there, not in this repo. Domain terms are shared with its `CONTEXT.md`.

When a backend task turns out to need a frontend change, don't make it on your own. Ask the user whether to do it in the current session or to file it as a separate ticket in the frontend repo (its local tracker: `../berlincoffeemap/.scratch/<feature>/issues/NN-<slug>.md`, see `../berlincoffeemap/docs/agents/issue-tracker.md`).
