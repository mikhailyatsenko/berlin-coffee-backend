import { GraphQLError } from "graphql";
import mongoose from "mongoose";
import { IUser } from "../models/User.js";
import { GuestContext, requireGuestIdentity } from "./guestAuth.js";

/**
 * Reviews belong to either a signed-in user or a guest identity. This resolves
 * whichever the request carries into the ownership fields used to look up and
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
  guest: GuestContext | undefined,
  { guestId, guestSecret }: GuestArgs,
): Promise<ReviewActor> {
  if (user) {
    return { isGuest: false, owner: { userId: user.id } };
  }

  if (guest?.status === "valid") {
    return { isGuest: true, owner: { guestId: guest.identity.guestId } };
  }

  // The headers carried credentials that no longer work. Say so rather than
  // falling through to "sign in": the client has to drop them and mint a new
  // identity, which is a different instruction.
  if (guest?.status === "invalid") {
    throw new GraphQLError("Guest session is not valid", {
      extensions: { code: "GUEST_IDENTITY_INVALID", reason: guest.reason },
    });
  }

  // Argument form, kept while the previous frontend build is still being
  // served. Remove together with the rest of the rollout compatibility once
  // every client sends the headers.
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

/** Identifies the caller on read paths, where there is nothing to authorise. */
export type ActorRef = { userId: string } | { guestId: string } | undefined;

export function resolveActorRef(
  user: { id: string } | null | undefined,
  guest: GuestContext | undefined,
): ActorRef {
  if (user?.id) {
    return { userId: user.id };
  }

  if (guest?.status === "valid") {
    return { guestId: guest.identity.guestId };
  }

  return undefined;
}

/**
 * Aggregation expression that picks the caller's own interactions out of a
 * place's interactions array, for use as a $filter cond over "$$this".
 *
 * The anonymous case is an explicit false rather than a comparison against
 * null: guest documents have no userId field at all, and leaning on how the
 * aggregation language compares a missing field to null is a trap worth not
 * setting.
 */
export function ownInteractionCond(actor: ActorRef) {
  if (actor && "userId" in actor) {
    return {
      $eq: ["$$this.userId", new mongoose.Types.ObjectId(actor.userId)],
    };
  }

  if (actor && "guestId" in actor) {
    return { $eq: ["$$this.guestId", actor.guestId] };
  }

  return { $literal: false };
}
