import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { appError, notFound } from "../../errors.js";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";

export const resendConfirmationEmailResolver: MutationResolvers["resendConfirmationEmail"] =
  async (_parent, { email: rawEmail }) => {
    const email = normalizeEmail(rawEmail);
    // Find by current email (registration flow) or by pendingEmail (email change flow)
    let user = (await User.findOne({ email })) as IUser | null;
    if (!user) {
      user = (await User.findOne({ pendingEmail: email })) as IUser | null;
    }
    if (!user) {
      throw notFound("User with this email does not exist.");
    }

    const isEmailChange = user.pendingEmail === email;
    if (!isEmailChange && user.isEmailConfirmed) {
      // Registration flow: if already confirmed, no need to resend
      throw appError("EMAIL_ALREADY_CONFIRMED", "Email is already confirmed.");
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

    const mailerSend = new MailerSend({
      apiKey: config.mailerSendApiKey,
    });

    await mailerSend.email.send(
      new EmailParams()
        .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
        .setTo([new Recipient(email)])
        .setSubject("Confirm your email")
        .setHtml(
          `<p>Click <a href="${confirmationUrl}">here</a> to confirm your email. This link is valid for 1 hour.</p>`,
        )
        .setText(`Confirm your email: ${confirmationUrl} (valid for 1 hour)`),
    );

    return { success: true };
  };
