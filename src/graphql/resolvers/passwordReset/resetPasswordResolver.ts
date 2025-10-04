import User from "../../../models/User.js";
import { GraphQLError } from "graphql";
import crypto from "crypto";
import bcrypt from "bcrypt";

export async function resetPasswordResolver(
  _: never,
  { token, email, newPassword }: { token: string; email: string; newPassword: string },
) {
  try {
    if (newPassword.length < 8) {
      throw new GraphQLError("Password must be at least 8 characters long", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      throw new GraphQLError("Invalid token or email", { extensions: { code: "UNAUTHORIZED" } });
    }

    if (!user.passwordResetTokenExpires || user.passwordResetTokenExpires < new Date()) {
      throw new GraphQLError("Reset link has expired", { extensions: { code: "TOKEN_EXPIRED" } });
    }

    if (user.passwordResetToken !== hashedToken) {
      throw new GraphQLError("Invalid reset token", { extensions: { code: "INVALID_TOKEN" } });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    user.passwordResetToken = null;
    user.passwordResetTokenExpires = null;
    await user.save();

    return { success: true };
  } catch (error) {
    console.error("Error in resetPassword:", error);
    if (error instanceof GraphQLError) throw error;
    throw new GraphQLError("Failed to reset password", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
}



