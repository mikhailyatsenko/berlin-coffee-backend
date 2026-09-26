import { Request } from "express";
import { GraphQLError } from "graphql";
import validator from "validator";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { IUser } from "../../../models/User.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";
import { sendAdminSuggestionEmail } from "./sendAdminSuggestionEmail.js";

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INSTAGRAM_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;

interface SubmitPlaceSuggestionArgs extends GuestArgs {
  input: {
    name: string;
    address: string;
    description?: string | null;
    instagram?: string | null;
    email?: string | null;
  };
}

const badInput = (message: string) =>
  new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });

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

export async function submitPlaceSuggestionResolver(
  _: never,
  { input, guestId, guestSecret }: SubmitPlaceSuggestionArgs,
  {
    user,
    guest,
    req,
  }: { user?: IUser | null; guest?: GuestContext; req?: Request },
): Promise<string> {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

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
    status: "pending",
  });

  await sendAdminSuggestionEmail({
    id: suggestion.id,
    name,
    address,
    suggestedBy: actor.isGuest ? "guest" : "user",
  });

  return suggestion.id;
}
