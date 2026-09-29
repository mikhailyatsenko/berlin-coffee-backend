# Write the implement-ready tickets

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 11

## Question

Turn every decided finding (the "already decided" list in `map.md` Notes plus each resolved ticket's Answer) into `ready-for-agent` tickets in `.scratch/backend-hardening/issues/`, ordered and blocked per the map's Notes. Run `/mattpocock-skills:to-tickets` with this map as input. Also hand off the frontend parts the decisions require to `../berlincoffeemap/.scratch/`.

## Answer

Resolved 2026-09-29. 23 `ready-for-agent` backend tickets in [`.scratch/backend-hardening/issues/`](../../backend-hardening/issues/) and 6 frontend tickets in `../berlincoffeemap/.scratch/backend-hardening/issues/`, each with Problem / Current / Expected / Acceptance criteria and its own test.

**Granularity (the open "Not yet specified" item):** findings that change the same code for the same reason are bundled; findings of a different nature are split, even when the map listed them together.
- Bundled: Rating range + `placeId` check + length limits → 06 "Mutations validate their input"; `/imagekit/auth` + `Cache-Control: public` → 08; all dead code + duplicate body parsers + body limit → 23.
- Split: the `interactions.placeId` index (operations, 18) from the shared Place stats module (refactor, 21); the recipient mail bucket lands in the abuse-limits ticket (14) inside the mail module from 13, so the Mail module ticket stays one context window.
- Infrastructure clients (A5) stay a side effect (13 transport seam, 22 ImageKit throttle), no own ticket.

**Order** (per map Notes: foundations → data/security bugs → operations → refactors):
- Foundations: 01 Error contract foundation → 02 Resolvers follow the error contract → 04 Typed resolvers (after the Sweep, so the `deleteReview`/`toggleCharacteristic` error branches are rewritten once); 03 Config module in parallel.
- Bugs: 05 Email normalization, 06 Input validation, 07 Upsert first Interaction, 08 HTTP surface, 09 Schema fields, 10 Avatar, 11 Session revocation, 12 Google sign-in, 13 Mail module, 14 Abuse limits, 15 Email change collisions, 16 Account deletion, 17 Guest deletes own Review.
- Operations: 18 `placeId` index (migration script), 19 Deploy gated on CI, 20 Release directories with rollback (merge waits for a one-time human server step).
- Refactors: 21 Place stats module, 22 ImageKit throttling, 23 Dead code and body limit.
- Resolver-touching fixes are blocked by 04 (ticket 02's order: typing before the bug fixes).

**Frontend handoffs** (ready-for-agent, each blocked by its backend ticket): 01 `existingPlaceId` (← 01), 02 stop Vercel `dev` deploy (← 03), 03 reset auth store on `UNAUTHENTICATED` (← 11), 04 reCAPTCHA on reset and resend (← 14, same-day deploy), 05 Guest deletes own Review (← 17), 06 `EMAIL_TAKEN` toast (← 15).

Numbers not fixed by the audit and chosen here: `reviewText` ≤ 1000 characters (the frontend's existing `maxLength`), `displayName` 1–50, password 8–72 bytes; JSON body limit `5mb`; 5 releases kept.

