import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js";
import { IMAGEKIT_URL_ENDPOINT } from "../../../config/env.js";
import { uploadAvatar, deleteAvatar } from "../../../utils/imagekit.js";

export async function uploadAvatarResolver(
  _: never,
  { userId, fileBuffer, fileName }: { userId: string; fileBuffer: string; fileName: string },
  context: { user?: IUser },
) {
  try {
    if (!context.user || context.user.id !== userId) {
      throw new GraphQLError("Unauthorized", {
        extensions: { code: "UNAUTHORIZED" },
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: { code: "NOT_FOUND" },
      });
    }

    if (!fileBuffer || !fileName) {
      throw new GraphQLError("Invalid file data", {
        extensions: { code: "BAD_USER_INPUT" },
      });
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
    const fileId = await uploadAvatar(buffer, fileName, userId);



    // Save file ID to user
    const filePath = `3welle/avatars/${userId}/avatar-${userId}.jpeg`;
    const avatarUrl = `${IMAGEKIT_URL_ENDPOINT}/${filePath}`;
    user.avatar = avatarUrl;
    await user.save();

    // Get the avatar URL

    return {
      success: true,
      fileId,
      avatarUrl,
    };
  } catch (error) {
    console.error("Error uploading avatar:", error);
    throw new GraphQLError("Error uploading avatar", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}



