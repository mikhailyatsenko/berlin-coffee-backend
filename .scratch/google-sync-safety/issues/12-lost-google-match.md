# 12: Lost Google match: mark on 404, skip while the ID is unchanged

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Sync plan file, Schema, Testing Decisions scenario 7). Decisions: [Places Google answers "not found" for](05-not-found-places.md). Glossary: Lost Google match.

**What to build:** a Place Google answers 404 for is paid for once, not every month. The plan proposes a mark for it; once applied, the Place is a Lost Google match: it stays on the map, later plans skip it while its Google Place ID is unchanged, and the summary reminds the admin to fix it with a Google Maps search link. Changing its Google Place ID by hand makes the next plan look it up again.

**Blocked by:** 08 (Sync budget), 09 (Applying a Sync plan and recording the Applied sync), 11 (Readable summary next to every plan).

- [ ] Place gains `googleNotFoundId` and `googleNotFoundAt` (default null), not exposed in GraphQL; Places stay visible on the map whatever their value.
- [ ] A 404 adds a change `googleNotFoundId: null → <the googleId that answered 404>` besides the `notFound` item; applying it also sets `googleNotFoundAt`, rolling it back clears both.
- [ ] `plan` skips Places whose `googleNotFoundId` equals their `googleId`, lists them in `skipped` (name, address, mark, marked at) and leaves them out of N for the reservation.
- [ ] The summary counts skipped Places and lists them with when they were marked and a Google Maps search link for name + address.
- [ ] Tests: (7) a 404 yields the `notFound` item and the mark entry; after applying it the next `plan` doesn't request the Place and reserves one less; after changing `googleId` the Place is requested again.
