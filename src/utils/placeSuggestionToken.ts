import crypto from "crypto";
import { GraphQLError } from "graphql";
import mongoose from "mongoose";
import PlaceSuggestion, {
  IPlaceSuggestion,
} from "../models/PlaceSuggestion.js";
import { PLACE_SUGGESTION_REVIEW_SECRET } from "../config/env.js";

/**
 * The admin acts on a Place suggestion through a link that carries this token,
 * an HMAC of the suggestion id. It is the only authorization there is: no
 * sign-in, no expiry (ADR 0002 in the frontend repo).
 */

export const signReviewToken = (suggestionId: string): string =>
  crypto
    .createHmac("sha256", PLACE_SUGGESTION_REVIEW_SECRET!)
    .update(suggestionId)
    .digest("hex");

export function isValidReviewToken(
  suggestionId: string,
  token: string,
): boolean {
  const expected = Buffer.from(signReviewToken(suggestionId));
  const actual = Buffer.from(token);

  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

/** One error for a wrong token and an unknown id, so the link reveals nothing about which ids exist. */
export const invalidReviewLinkError = () =>
  new GraphQLError("This link is not valid", {
    extensions: { code: "INVALID_REVIEW_LINK" },
  });

/** Every admin operation starts here: the suggestion, or the one error. */
export async function requireSuggestionForReview(
  id: string,
  token: string,
): Promise<IPlaceSuggestion> {
  if (!mongoose.isValidObjectId(id) || !isValidReviewToken(id, token)) {
    throw invalidReviewLinkError();
  }

  const suggestion = await PlaceSuggestion.findById(id);

  if (!suggestion) {
    throw invalidReviewLinkError();
  }

  return suggestion;
}
