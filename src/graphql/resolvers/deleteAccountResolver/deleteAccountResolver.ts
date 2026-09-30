import User from "../../../models/User.js";
import Interaction from "../../../models/Interaction.js";
import GuestIdentity from "../../../models/GuestIdentity.js";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import {
  avatarFilePath,
  deleteAvatar,
  deleteImageKitFolder,
  reviewPhotoFolder,
} from "../../../utils/imagekit.js";
import { clearAuthCookies } from "../../../utils/tokenUtils.js";
import { requireUser } from "../../context.js";
import type { MutationResolvers } from "../../generated/types.js";

/**
 * Removes the User with their Interactions, Photos, avatar and claimed Guest
 * identities; their Place suggestions stay, with no author.
 *
 * ImageKit goes first: if any file can't be deleted the call fails with the
 * database untouched, so nothing is forgotten while its files remain. Every
 * database step is idempotent and the User goes last, so after a crash the
 * User can still sign in and a retry finishes the job. Other devices lose
 * their Session because their tokens no longer find a User.
 */
export const deleteAccountResolver: MutationResolvers["deleteAccount"] = async (
  _parent,
  _args,
  context,
) => {
  const user = requireUser(context);
  const userId = user._id;

  const avatarPath = user.avatar ? avatarFilePath(user.avatar) : null;
  if (avatarPath) await deleteAvatar(avatarPath);

  // Every Interaction, not only those counting Photos: an interrupted upload
  // or Photo delete can leave files behind a counter of 0. A missing folder
  // costs one call and counts as deleted.
  const interactions = await Interaction.find({ userId })
    .select("placeId")
    .lean();
  for (const { _id, placeId } of interactions) {
    await deleteImageKitFolder(
      reviewPhotoFolder(placeId.toString(), _id.toString()),
    );
  }

  await Interaction.deleteMany({ userId });
  // $unset, never null: an absent userId is what marks an authorless suggestion.
  await PlaceSuggestion.updateMany({ userId }, { $unset: { userId: "" } });
  await GuestIdentity.deleteMany({ claimedBy: userId });
  await User.deleteOne({ _id: userId });

  clearAuthCookies(context.res);

  return {
    success: true,
  };
};
