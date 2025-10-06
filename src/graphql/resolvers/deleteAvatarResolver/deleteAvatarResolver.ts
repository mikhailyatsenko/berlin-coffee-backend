import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js";
import { deleteAvatar } from "../../../utils/imagekit.js";
import { IMAGEKIT_URL_ENDPOINT } from "../../../config/env.js";

export async function deleteAvatarResolver(
  _: never,
  __: never,
  context: { user?: IUser },
) {
  try {
    if (!context.user) {
      throw new GraphQLError("Unauthorized", {
        extensions: { code: "UNAUTHORIZED" },
      });
    }

    const user = await User.findById(context.user.id);
    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: { code: "NOT_FOUND" },
      });
    }

    if (user.avatar) {

      
    
        try {
          const filePath = user.avatar.replace(IMAGEKIT_URL_ENDPOINT!, '');
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
  } catch (error) {
    console.error("Error deleting avatar:", error);
    throw new GraphQLError("Error deleting avatar", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
