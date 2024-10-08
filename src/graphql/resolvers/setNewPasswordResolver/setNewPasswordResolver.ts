import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js"; // Импорт модели пользователя
import bcrypt from "bcrypt"; // Импорт библиотеки для хеширования паролей

export async function setNewPasswordResolver(
  _: never,
  {
    userId,
    oldPassword,
    newPassword,
  }: { userId: string; oldPassword?: string; newPassword: string },
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

    if (!user.googleId && !user.password) {
      throw new GraphQLError("Something wrong. Try later");
    }

    if (user.password) {
      const isMatch = await bcrypt.compare(oldPassword || "", user.password);
      if (!isMatch) {
        throw new GraphQLError("Old password is incorrect", {
          extensions: {
            code: "UNAUTHORIZED",
          },
        });
      }
    }

    if (newPassword.length < 8) {
      throw new GraphQLError("Password must be at least 8 characters long", {
        extensions: {
          code: "BAD_USER_INPUT",
        },
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedNewPassword;
    await user.save();

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error changing password:", error);
    throw new GraphQLError("Error changing password", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
