import mongoose from "mongoose";
import Place from "../models/Place.js";
import { badInput, notFound } from "../graphql/errors.js";

/**
 * Checks for what a mutation writes through the API. Each throws
 * BAD_USER_INPUT with a message the user sees; imported Google reviews don't
 * pass through here.
 */

const MIN_RATING = 1;
const MAX_RATING = 5;

/** A Rating is a whole number from 1 to 5, on a first Rating and on an update. */
export function assertRating(rating: number) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw badInput(
      `Rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}`,
    );
  }
}

const MAX_REVIEW_TEXT = 1000;

/** The frontend's `maxLength` on the Review text field, counted after trim. */
export function assertReviewText(text: string) {
  if (text.trim().length > MAX_REVIEW_TEXT) {
    throw badInput(
      `Review text must be at most ${MAX_REVIEW_TEXT} characters long`,
    );
  }
}

const MAX_DISPLAY_NAME = 50;

/** The name to store: trimmed, 1–50 characters. */
export function parseDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    throw badInput("Name is required");
  }
  if (trimmed.length > MAX_DISPLAY_NAME) {
    throw badInput(`Name must be at most ${MAX_DISPLAY_NAME} characters long`);
  }
  return trimmed;
}

const MIN_PASSWORD_BYTES = 8;
/** bcrypt ignores everything past 72 bytes, so two longer passwords could match. */
const MAX_PASSWORD_BYTES = 72;

/** A password being set (not one being checked at sign-in), in UTF-8 bytes. */
export function assertNewPassword(password: string) {
  const bytes = Buffer.byteLength(password, "utf8");
  if (bytes < MIN_PASSWORD_BYTES) {
    throw badInput(
      `Password must be at least ${MIN_PASSWORD_BYTES} characters long`,
    );
  }
  if (bytes > MAX_PASSWORD_BYTES) {
    throw badInput("Password is too long");
  }
}

/** A malformed id is BAD_USER_INPUT, a well-formed unknown one NOT_FOUND. */
export async function assertPlaceExists(placeId: string) {
  if (!mongoose.isObjectIdOrHexString(placeId)) {
    throw badInput("Invalid placeId");
  }
  if (!(await Place.exists({ _id: placeId }))) {
    throw notFound("Place not found");
  }
}
