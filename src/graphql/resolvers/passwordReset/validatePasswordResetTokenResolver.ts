import User from "../../../models/User.js";
import { GraphQLError } from "graphql";
import crypto from "crypto";

export async function validatePasswordResetTokenResolver(
  _: never,
  { token, email }: { token: string; email: string },
) {
  try {
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

    return { success: true };
  } catch (error) {
    console.error("Error in validatePasswordResetToken:", error);
    if (error instanceof GraphQLError) throw error;
    throw new GraphQLError("Failed to validate reset token", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
}
