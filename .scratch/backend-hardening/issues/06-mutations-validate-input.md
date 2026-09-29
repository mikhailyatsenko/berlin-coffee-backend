# 06: Mutations validate their input (Rating range, Place id, lengths)

Status: done
Blocked by: 04 (Typed resolvers)
Source: `map.md` Notes, "Rating range on update", "Length limits", "Input validation"

## Problem

Several mutations store whatever they receive. A Rating of `4.7` or `99` can be written into an existing Review and skews the Average rating; a Review or rating can be attached to a Place that doesn't exist; text fields and passwords have no length cap (and bcrypt silently ignores bytes past 72, so two different long passwords match).

## Current behaviour

- `addRating` updates an existing Interaction with `findOneAndUpdate` without validators (`addRatingResolver.ts:43`), and the schema type is `Float!`, so any number passes on update.
- `addRating` / `addTextReview` never check that `placeId` is a valid ObjectId of an existing Place; an invalid id becomes a cast error (500), a valid unknown id creates an orphan Interaction.
- No limits on `reviewText`, `displayName` or the password (register, `setNewPassword`, `resetPassword`).

## Expected behaviour

All violations throw `BAD_USER_INPUT` with a user-facing message (error module from ticket 01):
- Rating must be an integer 1–5, checked in the resolver for create and update alike.
- `placeId` must be a valid ObjectId of an existing Place for `addRating` and `addTextReview`; otherwise `NOT_FOUND` "Place not found" (invalid format → `BAD_USER_INPUT`).
- Length limits, matching what the frontend already enforces where it does: `reviewText` ≤ 1000 characters after trim (the frontend's `maxLength={1000}` in `AddTextReviewForm`); `displayName` 1–50 characters after trim (the frontend has no limit; 50 is new); password 8–72 **bytes** (UTF-8) on register, `setNewPassword` and `resetPassword` (8 matches the frontend's Yup schemas; 72 is bcrypt's limit). Limits apply to writes through the API only; imported Google reviews are not touched.
- Sign-in does not apply the length rule (an existing password is simply checked).

## Acceptance criteria

- [x] Test: `addRating` with `4.5`, `0` and `6` → `BAD_USER_INPUT`, both on a first Rating and on an update; stored Rating unchanged.
- [x] Test: `addRating` / `addTextReview` with a malformed `placeId` → `BAD_USER_INPUT`; with an unknown valid id → `NOT_FOUND`; no Interaction created.
- [x] Test: over-long `reviewText`, empty/over-long `displayName`, and a password over 72 bytes (multi-byte characters counted as bytes) are refused.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/mutations-validate-input`).

- `src/utils/validateInput.ts`: `assertRating` (whole number 1–5), `assertReviewText` (≤ 1000 characters after trim), `parseDisplayName` (returns the trimmed name, 1–50 characters), `assertNewPassword` (8–72 UTF-8 bytes) and `assertPlaceExists` (malformed id → `BAD_USER_INPUT` "Invalid placeId", the same message as `placeResolver`; unknown id → `NOT_FOUND` "Place not found"). All errors come from the `errors.ts` constructors.
- `addRating` / `addTextReview`: the value check runs first, then the actor, then the Place check. So a refused call creates no Interaction and costs no guest quota. The schema type for Rating stays `Float!`; the check is in the resolver, as the ticket asks.
- register, `setNewPassword` and `resetPassword` go through `assertNewPassword`. Sign-in is untouched (tested with a 5-character password).
- Decisions beyond the letter of the ticket:
  - The name is **stored trimmed** (register and `updatePersonalData`). Review text is only *measured* after trim and stored as sent, so the returned `text` stays unchanged.
  - `updatePersonalData`: `displayName: null` means "no change". An empty or blank string is now refused (it used to be "no change"; the frontend always sends a required, trimmed name). Resending the **current** name is also "no change", so a User whose name is already over 50 characters (e.g. from Google) can still change their email in AccountSettings, which always sends the name.
  - The password minimum is also counted in bytes, as the ticket says. A 4-character Cyrillic password (8 bytes) passes the server, while the frontend's Yup `min(8)` counts characters and stops it first. The message stays "at least 8 characters long". Over 72 bytes the message is "Password is too long".
- Code review: Standards found no hard violations and Spec found nothing missing. Applied: `parseDisplayName` instead of `validDisplayName`, constants for the Rating bounds, the `placeId` message aligned with `placeResolver`, test titles in glossary terms, and the exemption for an unchanged long name (plus a test). Not applied, as candidates for later: the same placeId check hand-rolled in `toggleFavorite`, `toggleCharacteristic` and `placeResolver` (not in this ticket's scope), and `withCode` / the fake reCAPTCHA copied between test files (they could move to `tests/support/`).
- Tests: `tests/inputValidation.test.ts` covers every acceptance criterion, both boundaries (1 and 5, 1000 characters, 50 characters, exactly 72 bytes) and sign-in. `tsc --noEmit` is clean and `npm test` passes 164/164.
- Frontend: nothing blocking, since the schema is unchanged. Optional follow-up: `maxLength` 50 on the name and a 72-byte limit on the password in the forms, so the user sees the limit before the server refuses. Not handed off.
