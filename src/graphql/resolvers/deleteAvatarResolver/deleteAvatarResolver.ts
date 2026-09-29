import { avatarFilePath, deleteAvatar } from "../../../utils/imagekit.js";
import { requireUser } from "../../context.js";
import type { MutationResolvers } from "../../generated/types.js";

export const deleteAvatarResolver: MutationResolvers["deleteAvatar"] = async (
  _parent,
  _args,
  context,
) => {
  const user = requireUser(context);

  if (user.avatar) {
    // A Google avatar (no file path) is no file of ours.
    const filePath = avatarFilePath(user.avatar);
    if (filePath) {
      try {
        await deleteAvatar(filePath);
      } catch (err) {
        console.warn("Error deleting avatar from ImageKit:", err);
      }
    }

    user.avatar = null;
    await user.save();
  }

  return {
    success: true,
  };
};
