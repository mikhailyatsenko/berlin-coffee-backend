import Interaction from "../../../models/Interaction.js";
import { resolveGuestIdentityForClaim } from "../../../utils/guestAuth.js";
import { requireUser } from "../../context.js";
import { appError } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";

/**
 * Attaches reviews left as a guest to the account that is now signed in.
 *
 * Conflicts (the account already reviewed that place) are skipped, not merged:
 * either merge direction would silently destroy a review the person wrote on
 * purpose. Skipped reviews stay anonymous and are reported back so the client
 * can say so.
 *
 * Idempotent — the client is expected to retry until it gets a response before
 * clearing its stored credentials.
 */
export const claimGuestReviewsResolver: MutationResolvers["claimGuestReviews"] =
  async (_parent, { guestId, guestSecret }, context) => {
    const user = requireUser(context);

    const identity = await resolveGuestIdentityForClaim(guestId, guestSecret);

    if (identity.claimedBy && identity.claimedBy.toString() !== user.id) {
      throw appError(
        "GUEST_IDENTITY_INVALID",
        "This guest session belongs to another account",
        { reason: "already_claimed" },
      );
    }

    const guestInteractions = await Interaction.find({ guestId }).lean();

    const placeIds = guestInteractions.map(
      (interaction) => interaction.placeId,
    );
    const ownInteractions = await Interaction.find({
      userId: user.id,
      placeId: { $in: placeIds },
    })
      .select("placeId")
      .lean();

    const takenPlaceIds = new Set(
      ownInteractions.map((interaction) => interaction.placeId.toString()),
    );

    let claimedCount = 0;
    let conflictedCount = 0;

    for (const interaction of guestInteractions) {
      if (takenPlaceIds.has(interaction.placeId.toString())) {
        conflictedCount += 1;
        continue;
      }

      await Interaction.updateOne(
        { _id: interaction._id, guestId },
        { $set: { userId: user._id }, $unset: { guestId: "" } },
      );
      claimedCount += 1;
    }

    if (conflictedCount > 0) {
      console.warn(
        `claimGuestReviews: ${conflictedCount} review(s) left unclaimed for user ${user.id} (place already reviewed)`,
      );
    }

    if (!identity.claimedBy) {
      identity.claimedBy = user._id;
      identity.claimedAt = new Date();
      await identity.save();
    }

    return { claimedCount, conflictedCount };
  };
