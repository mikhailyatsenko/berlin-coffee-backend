# 04: Find Google Place IDs for a Place suggestion, for free

**Status:** done

**What to build:** on the review page, the admin asks for up to three Google Place IDs matching the suggestion's name and address. Each comes flagged if a Place already has it. The lookup must cost nothing: it uses only Google's free "IDs Only" Text Search.

**Blocked by:** 01.

**Source:** frontend spec `../berlincoffeemap/.scratch/place-suggestions/spec.md` (Further Notes has the pricing facts), frontend ticket `../berlincoffeemap/.scratch/place-suggestions/issues/05-find-on-google.md` (it waits for this one). Google key and quota notes: `docs/google-places-sync.md`.

## Rules

- **`findGoogleIdsForSuggestion(id, token)`:**
  - calls Places API (New) Text Search with the query "<name>, <address>" and the field mask `places.id` only (SKU "Text Search Essentials IDs Only", unlimited free);
  - asks for at most 3 results;
  - uses the existing `GOOGLE_PLACES_API_KEY`.
- Returns `[{ googleId, existingPlaceId }]`, where `existingPlaceId` is set when a Place already has that ID. No results return an empty list; a Google error returns a clear error.
- No other Google endpoint or field anywhere in this feature. Add a line to `docs/google-places-sync.md` that this lookup exists and is free, and that the admin's chosen ID makes the monthly sync fill hours, phone and website.

## Tests

Stub `fetch`.

- [x] The request sends only the `places.id` field mask and asks for at most 3 results
- [x] IDs already on a Place come back with that Place's id
- [x] Empty and failed Google responses are handled; a bad token is rejected before any request
- [x] `npm test`, `tsc`, `npm run generate` green

## Comments

- 2026-09-27: Implemented on `feat/place-suggestion-find-google-ids` (branched from `main`), not merged yet.
- Schema: `findGoogleIdsForSuggestion(id: ID!, token: String!): [GoogleIdCandidate!]!` — a `Query`, not a `Mutation`, matching `placeSuggestionForReview`'s convention for read-only admin operations that change nothing server-side. `GoogleIdCandidate { googleId: String!, existingPlaceId: ID }`.
- `requireSuggestionForReview(id, token)` runs first, same as every other admin operation, so a bad token is rejected before any Google request.
- Google Text Search (New): `POST https://places.googleapis.com/v1/places:searchText`, body `{ textQuery: "<name>, <address>", pageSize: 3 }`, header `X-Goog-FieldMask: places.id` only — the free, uncapped "Text Search Essentials IDs Only" SKU. A non-2xx response or a `fetch` throw is logged and surfaced as one clear `GOOGLE_LOOKUP_FAILED` error; no results returns `[]`.
- `existingPlaceId` is resolved with one `Place.find({ "properties.googleId": { $in: googleIds } })`, not N queries.
- **`GOOGLE_PLACES_API_KEY` is now required at server boot** (added to `src/config/env.ts`'s `requiredEnvVars`, mirrored in `tests/support/mongod.ts`'s `setTestEnv`), not just checked inside the resolver. The ticket only said the resolver "uses the existing `GOOGLE_PLACES_API_KEY`", so this is a small scope decision beyond the letter of the ticket: the var is already documented as required for `syncGooglePlaces.ts` and already present in the production and local `.env` (same file backs both processes), so this shouldn't break any real environment — it just makes the requirement explicit and centralized instead of failing per-request. Documented in `README.md`. Worth a second look if some environment runs the server without the sync script's `.env`.
- The sync script (`src/scripts/syncGooglePlaces.ts`) keeps its own separate `GOOGLE_PLACES_API_KEY` check — now redundant with `env.ts`'s, left alone since touching it isn't asked for and it's harmless.
- `docs/google-places-sync.md` gets a new "Find on Google" section: what the lookup does, why it's free (SKU), and that Publish with the chosen ID is what lets the monthly sync fill hours/phone/website.
- Tests: `tests/placeSuggestions.test.ts` grew from 24 to 30 tests. A fake `fetch` (`fetchCalls`, `setGoogleResponse`) sits next to the existing fake MailerSend, restored in an `after()` hook. `npm test` (76 pass across the suite), `tsc --noEmit` and `npm run generate` (no drift) are green.
- Code review (Standards + Spec): no hard violations on either axis. Standards flagged one judgement call, left as is: `searchGooglePlaceIds` here and `syncGooglePlaces.ts`'s `fetchPlace` both build Google Places (New) requests with no shared helper — not extracted, since their error/retry strategies differ (fail-fast GraphQL error vs. a CLI job's backoff-and-retry). Spec flagged the `GOOGLE_PLACES_API_KEY` boot-requirement scope note above, no other gaps.
- Frontend ticket 05 (`../berlincoffeemap/.scratch/place-suggestions/issues/05-find-on-google.md`) can run codegen against this schema.
