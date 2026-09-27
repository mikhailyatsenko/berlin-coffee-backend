# 02: Publish or reject a Place suggestion (without photos)

**Status:** ready-for-agent

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

- [ ] Missing required fields, coordinates outside Berlin and an unknown Neighborhood are rejected
- [ ] A duplicate Google Place ID fails with the existing Place's id
- [ ] Publish creates a visible Place with the given fields and `[lng, lat]` coordinates; the suggestion is `published` with its id
- [ ] The outcome email goes to the User's account email, to the Guest email, or to nobody; the Guest email is erased afterwards
- [ ] Reject marks `rejected`, erases the email, sends nothing
- [ ] A second Publish or Reject, in either order, changes nothing and returns the first outcome
- [ ] `npm test`, `tsc`, `npm run generate` green
