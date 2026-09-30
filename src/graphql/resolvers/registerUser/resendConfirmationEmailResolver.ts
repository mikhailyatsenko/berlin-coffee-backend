import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import {
  recipientAllowed,
  sendEmailConfirmation,
} from "../../../mail/mail.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";

export const resendConfirmationEmailResolver: MutationResolvers["resendConfirmationEmail"] =
  async (_parent, { email: rawEmail, captchaToken }, { req }) => {
    const ip = clientIp(req);
    await verifyRecaptcha(captchaToken ?? "", "resend_confirmation_email", ip);
    consumeRateLimit("resendConfirmation", ip);

    const email = normalizeEmail(rawEmail);
    // Always success, whether or not a mail goes out, so the answer doesn't
    // say which addresses have an account; the recipient limit is silent too.
    if (!recipientAllowed(email)) {
      return { success: true };
    }

    // At most one User gets the mail. An owner of the address decides it
    // alone: unconfirmed gets it, confirmed gets nothing. With no owner, the
    // User whose pending change to it is the latest.
    const owner = (await User.findOne({ email })) as IUser | null;
    let user: IUser | null;
    if (owner) {
      user = owner.isEmailConfirmed ? null : owner;
    } else {
      user = (await User.findOne({ pendingEmail: email }).sort({
        emailConfirmationTokenExpires: -1,
      })) as IUser | null;
    }
    if (!user) {
      return { success: true };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const tokenExpires = addHours(new Date(), 1); // TTL 1 hour

    user.emailConfirmationToken = hashedToken;
    user.emailConfirmationTokenExpires = tokenExpires;
    await user.save();

    const confirmationUrl = `${config.frontendUrl}/confirm-email?token=${rawToken}&email=${encodeURIComponent(email)}`;

    await sendEmailConfirmation(email, confirmationUrl);

    return { success: true };
  };
