import { GraphQLError } from "graphql";
import { IUser } from "../models/User.js";
import { requireGuestIdentity } from "./guestAuth.js";

/**
 * Review mutations accept either a signed-in user or a guest identity. This
 * resolves whichever is present into the ownership filter used to look up and
 * create Interaction documents.
 *
 * Note the fields are deliberately absent rather than null: the partial unique
 * indexes on Interaction match on $exists, and null counts as existing.
 */

export interface GuestArgs {
  guestId?: string | null;
  guestSecret?: string | null;
}

export interface ReviewActor {
  isGuest: boolean;
  /** Use as both the lookup filter and the ownership fields on create. */
  owner: { userId: string } | { guestId: string };
}

export async function resolveReviewActor(
  user: IUser | null | undefined,
  { guestId, guestSecret }: GuestArgs,
): Promise<ReviewActor> {
  if (user) {
    return { isGuest: false, owner: { userId: user.id } };
  }

  if (!guestId || !guestSecret) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        requiresLogin: true,
      },
    });
  }

  const identity = await requireGuestIdentity(guestId, guestSecret);

  return { isGuest: true, owner: { guestId: identity.guestId } };
}

/**
 * A guest may fill in the parts of a review they have not written yet, but not
 * replace what is already there — editing is what registering is for.
 */
export function rejectGuestOverwrite(
  actor: ReviewActor,
  alreadySet: boolean,
): void {
  if (actor.isGuest && alreadySet) {
    throw new GraphQLError(
      "You have already left a review for this place. Sign up to edit it.",
      { extensions: { code: "GUEST_REVIEW_EXISTS", requiresLogin: true } },
    );
  }
}
