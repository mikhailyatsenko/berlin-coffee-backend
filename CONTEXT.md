# Berlin Coffee Map: Backend

The API behind a map of Berlin's specialty coffee places where people can find, rate and review them. The domain language is shared with the frontend repo (`../berlincoffeemap/CONTEXT.md`); terms below must match it. Frontend-only terms (Filters, Search, Quiz, Shortlist, Journal, Article, Place photo) live there.

## Language

**Place**:
A venue listed on the map. Coffee shops are the typical kind, but not the only one. Closed Places (Google `businessStatus` closed temporarily or permanently) are hidden from the map.
_Avoid_: Coffee shop, cafe, spot, location

**Neighborhood**:
The Berlin Bezirk a Place is in, one of the city's twelve, e.g. Friedrichshain-Kreuzberg.
_Avoid_: District, area, Kiez, Ortsteil

**Amenity**:
A factual feature of a Place imported from Google, such as dine-in or wheelchair access. Data, not opinion. Stored as `additionalInfo` on a Place.
_Avoid_: Tag, additional info

**Favorite**:
A Place a person has saved to come back to. Guests and Users have Favorites alike. Saving a Favorite is not a Visit.
_Avoid_: Bookmark, saved place, like

**Visit**:
A Place a person has been to, known from their own Review of it. Not marked separately; Guests and Users have Visits alike.
_Avoid_: Check-in, been there, visited place

**Place suggestion**:
A proposal from a User or Guest to add a Place that is not yet on the map, with its name, address and optionally Place photos. Not shown on the map until the admin publishes it; the admin completes the Place's details before publishing. Outlives its author: when a User deletes their account, their suggestions stay, anonymous.
_Avoid_: Submission, request, new place

**Google sync**:
Refreshing Places' opening hours, phone, website and closed-or-open status from Google, by each Place's Google Place ID, and filling in Google's description where a Place has none (a description already there is never replaced). Every Place looked up costs money beyond a monthly free allowance, so it runs rarely and by hand. Name, address and location are never taken from Google.
_Avoid_: Update script, refresh, import

**Sync plan**:
The list of changes a Google sync proposes, each one field of one Place with its current and proposed value. Reviewed and trimmed by the admin before anything reaches the map; only what is left in it gets written, and a change whose Place was edited since the plan was made is skipped, not overwritten.
_Avoid_: Diff, dry run, changeset

**Applied sync**:
What was actually written from a Sync plan, with each field's value from just before the write. A Google sync is undone from it; a field edited again since is left alone.
_Avoid_: Apply log, backup, sync log

**Sync budget**:
How many Places a Google sync may look up in one billing month (US Pacific), kept below Google's free allowance. A Sync plan is refused up front if it would not fit in what is left; Places looked up count against it whether Google found them or not.
_Avoid_: Quota, allowance, limit, ledger

**Lost Google match**:
A Place whose Google Place ID Google no longer recognises. The Google sync stops looking it up, so its details are no longer refreshed, until the admin gives it a new Place ID. Stays on the map: it says nothing about whether the Place is open.
A single 404 in a Sync plan is not yet a Lost Google match: the plan lists the Place under "not found" (a list of the plan, `notFound`) with a proposed mark, and the Place becomes a Lost Google match only once that mark is applied. Use "not found" only for that plan list, never for the Place itself.
_Avoid_: Not found (for the Place), missing, broken ID

**Inaccuracy report**:
A message from anyone that a Place's details are wrong, such as its opening hours or address.
_Avoid_: Complaint, feedback, correction

### People

**User**:
A person with an account, signed in by email and password, by Google, or by both. The email identifies the User: signing in with a Google account whose verified email belongs to a User signs in to that User. An email the User has not confirmed does not hold the address: whoever first proves they own the mailbox, by confirming it or by signing in with Google, takes it. Deleting the account removes the User with their Reviews (Photos included), Favorites, avatar, Sessions and the Guest identities they claimed; only their Place suggestions outlive them, with no author.
_Avoid_: Account, member

**Session**:
A User being signed in on one device. Ends when they sign out on that device, after 7 days, or when all their Sessions are revoked by a password change or reset (the device that changed the password stays signed in).
_Avoid_: Login, token

**Guest**:
A person without an account who has rated, reviewed or saved something. Identified only by their Guest identity.
_Avoid_: Anonymous, visitor

**Guest identity**:
The proof held in one browser that a Guest's Reviews and Favorites belong to them: a `guestId` plus a secret, of which only the hash is stored. Issued once after a reCAPTCHA check. Losing it leaves the Reviews public but no longer editable or removable by that Guest.
_Avoid_: Guest session, guest token

**Claim**:
Moving a Guest's Reviews and Favorites to the User account they sign in to. A Guest Review for a Place the User already reviewed is not moved and stays anonymous.
_Avoid_: Merge, migrate, transfer

### Reviews

**Review**:
One opinion about one Place: a Rating, Review text, Characteristics and Photos, any of which may be missing. Left by a User or Guest (at most one per Place), or imported as a Google review. Its author, User or Guest, can remove any part of it.
_Avoid_: Feedback, comment, interaction (in prose and API names)

**Google review**:
A Review imported from Google. No User or Guest stands behind it, and it cannot be edited here.
_Avoid_: External review, imported review

**Rating**:
The numeric score inside a Review, 1 to 5.
_Avoid_: Review (for the score alone), stars, vote

**Average rating**:
The mean of all Ratings for a Place, Google reviews included.
_Avoid_: Score, overall rating

**Review text**:
The written part of a Review.
_Avoid_: Text review, comment

**Photo**:
An image attached to a Review, stored in ImageKit. Users and Guests add their own; Google reviews bring theirs from Google.
_Avoid_: Image, picture, review image

**Characteristic**:
One of a fixed set of qualities (e.g. free Wi-Fi, pet friendly) that a person marks for a Place in their Review. The community's opinion, counted per Place.
_Avoid_: Feature, tag, attribute

## Code names

The database and code predate the glossary in places. Use the glossary term in prose, issues and new API names; use the code name only when pointing at code.

| Term                    | Code                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| Review, Favorite, Visit | one `Interaction` document per person and Place (`src/models/Interaction.ts`); a Favorite is `isFavorite`, a Visit is an Interaction with a Rating or Review text |
| Place                   | `NewPlace` model, `newplaces` collection                                |
| Amenity                 | `properties.additionalInfo`                                             |
| Photo                   | `reviewImages` (a count on the Interaction; the client renders `image_1..image_N` from it, so it only grows after the file is stored) |
| Guest identity          | `GuestIdentity` model                                                   |
| Place suggestion        | `PlaceSuggestion` model (`src/models/PlaceSuggestion.ts`); its status is `pending`, `published` or `rejected`; its photos are Place photos, never Photos |
| Sync budget             | `SyncBudgetMonth` model (one document per US Pacific month: `spent`, `reserved`) and `SyncRun` model (one record per `plan` run or `budget --set` correction) |
| Lost Google match       | `properties.googleNotFoundId` equal to `properties.googleId`, stamped with `properties.googleNotFoundAt` |
| Sync plan               | `untracked/google-sync/<datetime>-plan.json`, with its readable summary `<datetime>-plan.md` beside it |
| Applied sync            | `untracked/google-sync/<datetime>-applied.json`, next to the plan it was applied from |
