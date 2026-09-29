import { deleteAvatar } from "../../../utils/imagekit.js";
import { config } from "../../../config/config.js";
import { requireUser } from "../../context.js";
import type { MutationResolvers } from "../../generated/types.js";

export const deleteAvatarResolver: MutationResolvers["deleteAvatar"] = async (
  _parent,
  _args,
  context,
) => {
  const user = requireUser(context);

  if (user.avatar) {
    try {
      const filePath = user.avatar.replace(config.imagekit.urlEndpoint, '');
      await deleteAvatar(filePath);
    } catch (err) {
      console.warn("Error deleting avatar from ImageKit:", err);
    }

    user.avatar = null;
    await user.save();
  }

  return {
    success: true,
  };
};
