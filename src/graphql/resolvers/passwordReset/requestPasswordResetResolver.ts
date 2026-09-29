import User from "../../../models/User.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import { recipientAllowed, sendPasswordReset } from "../../../mail/mail.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";

export const requestPasswordResetResolver: MutationResolvers["requestPasswordReset"] = async (
  _parent,
  { email, captchaToken },
  { req },
) => {
  const ip = clientIp(req);
  await verifyRecaptcha(captchaToken ?? "", "request_password_reset", ip);
  consumeRateLimit("passwordReset", ip);

  const normalizedEmail = normalizeEmail(email);
  // Silent, like an unknown address, so the limit doesn't reveal accounts.
  if (!recipientAllowed(normalizedEmail)) {
    return { success: true };
  }

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
