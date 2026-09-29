import User from "../../../models/User.js";
import { appError } from "../../errors.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import { assertNewPassword } from "../../../utils/validateInput.js";

export const resetPasswordResolver: MutationResolvers["resetPassword"] = async (
  _parent,
  { token, email, newPassword },
) => {
  assertNewPassword(newPassword);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    throw appError("INVALID_TOKEN", "Invalid token or email");
  }

  if (!user.passwordResetTokenExpires || user.passwordResetTokenExpires < new Date()) {
    throw appError("TOKEN_EXPIRED", "Reset link has expired");
  }

  if (user.passwordResetToken !== hashedToken) {
    throw appError("INVALID_TOKEN", "Invalid reset token");
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedNewPassword;
  user.passwordResetToken = null;
  user.passwordResetTokenExpires = null;
  await user.save();

  return { success: true };
};
