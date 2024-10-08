import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js";

export async function uploadAvatarResolver(
  _: never,
  { userId, fileUrl }: { userId: string; fileUrl: string },
  context: { user?: IUser },
) {
  console.log("inside upload resolver");
  try {
    // Проверяем соответствие userId в контексте
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

    if (!fileUrl || typeof fileUrl !== "string") {
      throw new GraphQLError("Invalid file URL", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    user.avatar = fileUrl; // Сохраняем путь к новому аватару
    await user.save();

    return {
      success: true,
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
