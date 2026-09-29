import {
  uploadAvatar,
  deleteAvatar,
  avatarFilePath,
  avatarUrlFor,
} from "../../../utils/imagekit.js";
import { requireUser } from "../../context.js";
import { badInput, forbidden } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";

export const uploadAvatarResolver: MutationResolvers["uploadAvatar"] = async (
  _parent,
  { userId, fileBuffer, fileName },
  context,
) => {
  const user = requireUser(context);
  if (user.id !== userId) {
    throw forbidden("You can only change your own avatar");
  }

  if (!fileBuffer || !fileName) {
    throw badInput("Invalid file data");
  }

  const oldFilePath = user.avatar ? avatarFilePath(user.avatar) : null;

  // Upload the new file and save its URL first: the User never points at a
  // file that is gone, even if the old one's delete below fails.
  const buffer = Buffer.from(fileBuffer, "base64");
  const filePath = await uploadAvatar(buffer, userId);
  const avatarUrl = avatarUrlFor(filePath);
  user.avatar = avatarUrl;
  await user.save();

  // A Google avatar (oldFilePath null) is no file of ours.
  if (oldFilePath && oldFilePath !== filePath) {
    try {
      await deleteAvatar(oldFilePath);
    } catch (err) {
      // The new avatar is already in place; the old file is only left over.
      console.warn("Error deleting old avatar from ImageKit:", err);
    }
  }

  return {
    success: true,
    // The client has always received the file path under this name.
    fileId: filePath,
    avatarUrl,
  };
};
