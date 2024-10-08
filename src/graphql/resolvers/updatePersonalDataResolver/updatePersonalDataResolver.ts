import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js"; // Импорт модели пользователя

export async function updatePersonalDataResolver(
  _: never,
  {
    userId,
    displayName,
    email,
  }: { userId: string; displayName?: string; email?: string },
  context: { user?: IUser },
) {
  try {
    if (!context.user || context.user.id !== userId) {
      throw new GraphQLError("Unauthorized", {
        extensions: {
          code: "UNAUTHORIZED",
        },
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: {
          code: "NOT_FOUND",
        },
      });
    }

    if (displayName) {
      user.displayName = displayName;
    }
    if (email) {
      user.email = email;
    }

    await user.save();

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating profile:", error);
    throw new GraphQLError("Error updating profile", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
