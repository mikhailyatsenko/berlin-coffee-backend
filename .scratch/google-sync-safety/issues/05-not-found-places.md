# Places Google answers "not found" for

Type: grilling
Status: resolved
Blocked by:

## Question

Each Place in a Sync plan's `notFound` section is a billed 404 that counts against the Sync budget on every run until handled (01, 02). What happens to them?

- Does the admin fix them by hand (look up the new Place ID with the free Text Search, `findGoogleIdsForSuggestion`'s approach) and how does the plan or summary help with that?
- Should `plan` skip Places that answered 404 on the last run(s) until their Place ID changes, and where would that mark live (a Place field written outside a plan, or derived from earlier plans / the ledger's run records)?
- Is a Place that stays "not found" hidden, left as is, or flagged for the admin?
- How many Places are in this state today (from the September run's output, if kept), to judge how much this matters.

## Answer

Resolved by grilling with the owner, 2026-10-06. Glossary: **Lost Google match** added in `CONTEXT.md`. How many Places are in this state today is unknown: the September run's output wasn't kept, and finding out needs a billed run. The first run after rollout pays for them once.

**Marking.** When a Place answers 404, `plan` lists it in `notFound` and proposes an ordinary change entry `googleNotFoundId: <the Place ID that answered 404>` (current: null). It goes through review, `apply` and the Applied sync like any other entry; deleting it means the Place is looked up again next run.

**Skipping.** `plan` doesn't look up a Place while `googleNotFoundId === googleId`. Skipped Places are not part of the Sync budget reservation. A 404 is paid for once, not every month.

**Map.** A Lost Google match stays on the map: a 404 says nothing about whether the Place is open. If it has closed, the admin sets `businessStatus` by hand.

**Fixing.** The script searches for no candidates (an automatic Text Search proposal was considered and dropped by the owner). Every summary has a "Skipped: Lost Google match" section: name, when it was marked, a Google Maps search link by name and address. The admin fixes `googleId` by hand in Mongo (there is no mutation for editing a Place); because the mark stores the ID that failed, a new `googleId` makes the next run look the Place up again without clearing the mark. If Google ever restores the old ID, the admin removes the mark by hand (rare, accepted).
