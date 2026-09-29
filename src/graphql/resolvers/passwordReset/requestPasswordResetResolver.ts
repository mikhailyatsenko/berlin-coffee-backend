import User from "../../../models/User.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import { sendPasswordReset } from "../../../mail/mail.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";

export const requestPasswordResetResolver: MutationResolvers["requestPasswordReset"] = async (
  _parent,
  { email },
) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpires = addHours(new Date(), 1);

    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpires = tokenExpires;
    await user.save();

    const resetUrl = `${config.frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendPasswordReset(normalizedEmail, resetUrl);
  }

  // Always return success to prevent email enumeration
  return { success: true };
};
