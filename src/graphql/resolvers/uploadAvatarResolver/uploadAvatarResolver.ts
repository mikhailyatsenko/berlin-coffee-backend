import { IMAGEKIT_URL_ENDPOINT } from "../../../config/env.js";
import { uploadAvatar, deleteAvatar } from "../../../utils/imagekit.js";
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

  // Delete old avatar from ImageKit if exists
  if (user.avatar) {
    try {
      await deleteAvatar(user.avatar);
    } catch (err) {
      console.warn("Error deleting old avatar from ImageKit:", err);
    }
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(fileBuffer, 'base64');

  // Upload new avatar to ImageKit
  const fileId = await uploadAvatar(buffer, userId);

  // Save file ID to user
  const filePath = `3welle/avatars/${userId}/avatar-${userId}.jpeg`;
  const avatarUrl = `${IMAGEKIT_URL_ENDPOINT}/${filePath}`;
  user.avatar = avatarUrl;
  await user.save();

  return {
    success: true,
    fileId,
    avatarUrl,
  };
};
