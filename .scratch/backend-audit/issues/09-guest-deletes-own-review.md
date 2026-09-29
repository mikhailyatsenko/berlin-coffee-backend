# Can a Guest delete their own Review?

Type: grilling
Status: resolved
Blocked by: none

## Question

CONTEXT.md says a Guest identity makes a Guest's Reviews "editable by that Guest", and Guests can rate, write Review text and add Photos. But `deleteReview` requires a User (`deleteReviewResolver.ts:80`) and matches only `userId`, so a Guest cannot remove a Review, not even the text or the Rating. Is that intended (then the glossary should say editable but not deletable), or a gap (then `deleteReview` goes through `resolveReviewActor` like the other Review mutations, with a frontend change to offer the action)? Favorites are not part of this: Guest Favorites live in the frontend's localStorage (`guestFavorites` store).

## Answer

Resolved 2026-09-28 (grilling). A gap, not intent: a Guest can remove their own Review exactly as a User can.

Facts behind it: the block sits on both sides. Backend: `deleteReview` checks `context.user` and matches `userId` only (`deleteReviewResolver.ts:80,90`; its comment says Guest Reviews stay "out of reach until claimed"). Frontend: a Guest's Review already comes back `isOwnReview`, but the delete control is hidden by `canDelete={Boolean(user)}` (`ReviewList.tsx:61`) and `handleDeleteReview` shows "login required" without a User (`useDeleteReview.ts:114`). No spec or ADR records it as a decision.

Decisions:

1. **Owner via `resolveReviewActor`.** `deleteReview` resolves the caller like every other Review mutation and looks the Review up by `actor.owner` (`userId` or `guestId`). All three options (`deleteReviewText`, `deleteRating`, `deleteAll`) are open to Guests; one code path, only the owner differs.
2. **Headers only.** No `guestId`/`guestSecret` arguments are added to `deleteReview`: that would be new rollout compatibility, which the map rules out. Errors per the error contract: neither User nor Guest → `UNAUTHENTICATED`; invalid Guest credentials → `GUEST_IDENTITY_INVALID`; someone else's or a missing Review → `NOT_FOUND`. No abuse limit: a delete touches one document and sends no mail.
3. **Empty document after `deleteAll` stays**, as it does for a User. It counts in no Average rating and is no Visit; removing it is not an audit finding.
4. **Throwing folder delete.** When a delete clears Photos, `deleteReview` (User and Guest alike) uses the throwing `deleteImageKitFolder` introduced by the account-deletion ticket: an ImageKit failure fails the delete instead of resetting the counter over files still in the folder. The fence and lease logic stays.

Glossary: `CONTEXT.md` **Guest identity** now says losing it leaves Reviews "no longer editable or removable"; **Review** says its author, User or Guest, can remove any part of it.

Final ticketing: one backend ticket, blocked by Foundation (error contract) and the account-deletion ticket (throwing folder delete). Test on `tests/support/mongod.ts` with ImageKit stubbed: a Guest deletes text / Rating / all of their own Review; a Guest cannot delete another Guest's or a User's Review (`NOT_FOUND`); no identity → `UNAUTHENTICATED`; invalid identity → `GUEST_IDENTITY_INVALID`; a failing folder delete leaves the text and Photo counter in place. Frontend handoff: one ready-for-agent ticket: show the delete control on a Guest's own Review when a Guest identity is present (`canDelete`), and drop the `showLoginRequired` branch in `useDeleteReview` for Guests.
