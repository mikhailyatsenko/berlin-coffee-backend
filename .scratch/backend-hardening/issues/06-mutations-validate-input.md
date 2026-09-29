# 06: Mutations validate their input (Rating range, Place id, lengths)

Status: ready-for-agent
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

- [ ] Test: `addRating` with `4.5`, `0` and `6` → `BAD_USER_INPUT`, both on a first Rating and on an update; stored Rating unchanged.
- [ ] Test: `addRating` / `addTextReview` with a malformed `placeId` → `BAD_USER_INPUT`; with an unknown valid id → `NOT_FOUND`; no Interaction created.
- [ ] Test: over-long `reviewText`, empty/over-long `displayName`, and a password over 72 bytes (multi-byte characters counted as bytes) are refused.
- [ ] `tsc --noEmit` and `npm test` pass.
