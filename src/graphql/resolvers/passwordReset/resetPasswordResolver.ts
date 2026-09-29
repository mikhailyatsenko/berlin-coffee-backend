import User from "../../../models/User.js";
import { appError, badInput } from "../../errors.js";
import crypto from "crypto";
import bcrypt from "bcrypt";

export async function resetPasswordResolver(
  _: never,
  { token, email, newPassword }: { token: string; email: string; newPassword: string },
) {
  if (newPassword.length < 8) {
    throw badInput("Password must be at least 8 characters long");
  }

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

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedNewPassword;
  user.passwordResetToken = null;
  user.passwordResetTokenExpires = null;
  await user.save();

  return { success: true };
}
