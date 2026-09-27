# 02: Publish or reject a Place suggestion (without photos)

**Status:** done

**What to build:** from the review page, the admin publishes a Place suggestion as a new Place, which shows up on the map right away, and the suggester gets an email. Or the admin rejects it. Photos come in ticket 03; this ticket works for suggestions without any.

**Blocked by:** 01.

**Source:** frontend spec `../berlincoffeemap/.scratch/place-suggestions/spec.md`, frontend ticket `../berlincoffeemap/.scratch/place-suggestions/issues/03-review-page.md` (it waits for this one).

## Rules

- **`publishPlaceSuggestion(id, token, input)`:**
  - The input carries name, address, coordinates (lat, lng), Neighborhood, description, Instagram, website, phone, Google Place ID and the photo paths to keep (ignored until ticket 03).
  - Required: name, address, coordinates inside Berlin's bounding box (lat 52.33–52.68, lng 13.08–13.77), and one of the twelve Neighborhoods in the spelling Places use.
  - A Google Place ID that already belongs to a Place fails with an error carrying that Place's id.
  - Creates the Place:
    - GeoJSON point as `[lng, lat]`;
    - empty Amenities, empty opening hours, status `OPERATIONAL`;
    - default image;
    - no paid Google call.
  - Marks the suggestion `published` with the Place id and decided time.
  - Clears the caches a new Place makes stale (e.g. the Neighborhood list).
  - Emails the suggester through MailerSend: the User's email read from the account, else the Guest email, else nobody. The email links `<FRONTEND_DOMAIN>`'s Place page and asks for a Rating.
  - Then erases the Guest email.
- **`rejectPlaceSuggestion(id, token)`:** marks the suggestion `rejected`, erases the Guest email, sends no email.
- **Repeats:** Publish or Reject on a suggestion that isn't `pending` change nothing and return its current outcome (status, Place id).
- A bad token fails as in ticket 01.

## Tests

Extend `tests/placeSuggestions.test.ts`.

- [x] Missing required fields, coordinates outside Berlin and an unknown Neighborhood are rejected
- [x] A duplicate Google Place ID fails with the existing Place's id
- [x] Publish creates a visible Place with the given fields and `[lng, lat]` coordinates; the suggestion is `published` with its id
- [x] The outcome email goes to the User's account email, to the Guest email, or to nobody; the Guest email is erased afterwards
- [x] Reject marks `rejected`, erases the email, sends nothing
- [x] A second Publish or Reject, in either order, changes nothing and returns the first outcome
- [x] `npm test`, `tsc`, `npm run generate` green

## Comments

- 2026-09-27: Implemented on `feat/place-suggestion-publish-reject`, not merged yet.
- Schema: `publishPlaceSuggestion(id, token, input: PublishPlaceSuggestionInput!): PlaceSuggestionOutcome!`, `rejectPlaceSuggestion(id, token): PlaceSuggestionOutcome!`. `PlaceSuggestionOutcome` is just `{ status, publishedPlaceId }` — the "current outcome (status, Place id)" the ticket asks repeats to return. `CoordinatesInput { lat, lng }`. `photoPaths: [String!]` is on the input now and accepted, but ignored (ticket 03 acts on it).
- **The twelve Neighborhoods**: nothing in either repo already lists them (the `Neighborhood` select on the frontend, and `availableNeighborhoods` here, both derive dynamically from whatever Places already have — which would make the *first* Place in an empty Neighborhood unpublishable, a chicken-and-egg bug). So `src/utils/berlinGeography.ts` hardcodes the standard 12 Berlin Bezirke as the one source of truth, spelled to match `normalizeNeighborhood`'s convention (already in the codebase) and `CONTEXT.md`'s own example ("Friedrichshain-Kreuzberg"). Worth a second pair of eyes if any Place ever needs a Neighborhood spelled differently.
- **Duplicate Google Place ID error**: code `DUPLICATE_GOOGLE_PLACE_ID`, message `"This Google Place ID already belongs to a Place: <placeId>"` — the id is the literal last word. This is deliberate: `formatError` in `index.ts` only forwards `message` and `extensions.code` (same constraint ticket 01 hit for validation errors), so there's nowhere else to put the existing Place's id where the frontend could read it. Frontend ticket 03 needs to pull the id out of the message text (e.g. the last `[0-9a-f]{24}` in it), not out of extensions.
- Cache: only `invalidateNeighborhoodsCache()` — the other cache (`additionalInfoTags`) can't go stale, since a suggestion-published Place always has empty Amenities.
- "Default image" is just leaving `properties.image` unset (schema default `""`); the frontend already renders a placeholder for that.
- The outcome email is sent through the same `sendSuggestionPublishedEmail` best-effort pattern as the admin email in ticket 01 (logged on failure, never thrown) — the Place is already created by the time it's sent, so a MailerSend hiccup shouldn't fail Publish.
- Repeats: both resolvers check `status !== "pending"` before reading anything from the input, so a second Publish with garbage input still just returns the first outcome.
- Tests: `tests/placeSuggestions.test.ts` grew from 16 to 25 tests. `npm test` (71 pass), `tsc` and `npm run generate` (no drift) are green.
- Code review (Standards + Spec): Spec had no findings. Standards flagged one thing, fixed: `publishPlaceSuggestionResolver.ts` had its own `requiredText(value, field)`, same name as `submitPlaceSuggestionResolver.ts`'s `requiredText(value, field, maxLength)` but without the length cap — renamed to `requiredField` so the name doesn't imply a contract this input doesn't have.
- Frontend ticket 03 (`../berlincoffeemap/.scratch/place-suggestions/issues/03-review-page.md`) can run codegen against this schema.
