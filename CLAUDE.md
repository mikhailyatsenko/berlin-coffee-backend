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

Before the first edit in `../berlincoffeemap` from a session started in this repo, ask the user whether to make the change in the current session or to hand it to a separate frontend session. This holds even when the task, ticket or prompt itself says the work is on the frontend: that tells you where the change goes, not that this session should make it. Ask once per session, and don't edit the frontend until the user answers.

Put your recommendation first in that question, with a one-line reason drawn from the situation:
- this session, when the frontend change is small and fully decided and the current task can't be finished or checked without it (a few fields behind a ticket, a local server you can rebuild);
- a separate session, when it is large or still needs design, touches data or migrations, or the frontend repo has uncommitted work or another session working in it.

When the user hands it off, write it into the frontend's local tracker (`../berlincoffeemap/.scratch/<feature>/`, see `../berlincoffeemap/docs/agents/issue-tracker.md`) in the form that fits how clear the work is; choose it yourself and say which you chose:
- the work is fully decided (operations, UI, tests known, e.g. from a backend spec): a ready-for-agent ticket, `issues/NN-<slug>.md`, that `/mattpocock-skills:implement` can take as is;
- open questions remain (design, data, scope): a short `problem.md` with what the backend change needs from the frontend and why, links to the backend spec and ticket, and the open questions listed, no solution design. The user takes it to tickets in the frontend session.
