import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      const avatarPath = path.join(
        __dirname,
        "../../../uploads",
        `user-${user.id}`,
        "avatar",
        path.basename(user.avatar),
      );

      if (fs.existsSync(avatarPath)) {
        try {
          fs.unlinkSync(avatarPath);
        } catch (err) {
          throw new GraphQLError("Error deleting old avatar:");
        }
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
