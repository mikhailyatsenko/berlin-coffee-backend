import User from "../../../models/User.js";
import { appError } from "../../errors.js";
import crypto from "crypto";
import type { MutationResolvers } from "../../generated/types.js";

export const validatePasswordResetTokenResolver: MutationResolvers["validatePasswordResetToken"] = async (
  _parent,
  { token, email },
) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  
  if (!user) {
    throw appError("INVALID_TOKEN", "Invalid token or email");
  }

  if (!user.passwordResetTokenExpires || user.passwordResetTokenExpires < new Date()) {
    throw appError("TOKEN_EXPIRED", "Reset link has expired");
  }

  if (user.passwordResetToken !== hashedToken) {
    throw appError("INVALID_TOKEN", "Invalid reset token");
  }

  return { success: true };
};
