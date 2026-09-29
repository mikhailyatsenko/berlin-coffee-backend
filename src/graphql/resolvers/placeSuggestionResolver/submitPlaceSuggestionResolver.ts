import { badInput } from "../../errors.js";
import validator from "validator";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { config } from "../../../config/config.js";
import { sendSuggestionToAdmin } from "../../../mail/mail.js";
import { signReviewToken } from "../../../utils/placeSuggestionToken.js";
import type { MutationResolvers } from "../../generated/types.js";

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INSTAGRAM_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;

/** Trimmed text, or undefined when there is none: absent, never empty, in the database. */
function optionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > maxLength) {
    throw badInput(`${field} must be at most ${maxLength} characters`);
  }
  return text;
}

function requiredText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string {
  const text = optionalText(value, field, maxLength);
  if (!text) throw badInput(`${field} is required`);
  return text;
}

export const submitPlaceSuggestionResolver: MutationResolvers["submitPlaceSuggestion"] =
  async (_parent, { input, guestId, guestSecret }, { user, guest, req }) => {
    const actor = await resolveReviewActor(user, guest, {
      guestId,
      guestSecret,
    });

    const name = requiredText(input.name, "name", MAX_NAME_LENGTH);
    const address = requiredText(input.address, "address", MAX_ADDRESS_LENGTH);
    const description = optionalText(
      input.description,
      "description",
      MAX_DESCRIPTION_LENGTH,
    );
    const instagram = optionalText(
      input.instagram,
      "instagram",
      MAX_INSTAGRAM_LENGTH,
    );

    // Only a Guest leaves an email. A User's is read from their account when the
    // outcome email goes out, so one sent along with a User's suggestion is dropped.
    let guestEmail: string | undefined;
    if (actor.isGuest) {
      guestEmail = optionalText(input.email, "email", MAX_EMAIL_LENGTH);
      if (guestEmail && !validator.isEmail(guestEmail)) {
        throw badInput("email is not valid");
      }
    }

    // After validation, so a form the person has to fix costs them nothing.
    consumeRateLimit("placeSuggestion", clientIp(req));

    const suggestion = await PlaceSuggestion.create({
      ...actor.owner,
      name,
      address,
      ...(description && { description }),
      ...(instagram && { instagram }),
      ...(guestEmail && { guestEmail }),
    });

    await sendSuggestionToAdmin({
      name,
      address,
      suggestedBy: actor.isGuest ? "guest" : "user",
      reviewUrl: `${config.frontendUrl}/suggestions/${suggestion.id}/review?token=${signReviewToken(suggestion.id)}`,
    });

    return suggestion.id;
  };
