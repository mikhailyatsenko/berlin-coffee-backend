# 04: Find Google Place IDs for a Place suggestion, for free

**Status:** ready-for-agent

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

- [ ] The request sends only the `places.id` field mask and asks for at most 3 results
- [ ] IDs already on a Place come back with that Place's id
- [ ] Empty and failed Google responses are handled; a bad token is rejected before any request
- [ ] `npm test`, `tsc`, `npm run generate` green
