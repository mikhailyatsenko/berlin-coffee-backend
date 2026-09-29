import User from "../../../models/User.js";
import isEmail from "validator/lib/isEmail.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { env } from "../../../utils/env.utils.js";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import { type Context, requireUser } from "../../context.js";
import { badInput, forbidden } from "../../errors.js";

export async function updatePersonalDataResolver(
  _: never,
  {
    userId,
    displayName,
    email,
  }: { userId: string; displayName?: string; email?: string },
  context: Context,
) {
  const user = requireUser(context);
  if (user.id !== userId) {
    throw forbidden("You can only change your own profile");
  }

  if (displayName) {
    user.displayName = displayName;
  }
  if (email && email !== user.email) {
    if (!isEmail(email)) {
      throw badInput("Invalid email address");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser && String(existingUser._id) !== String(user._id)) {
      throw badInput("User already exists with this email.");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const tokenExpires = addHours(new Date(), 1);

    user.pendingEmail = email;
    user.emailConfirmationToken = hashedToken;
    user.emailConfirmationTokenExpires = tokenExpires;

    const confirmationUrl = `${env.frontendUrl}/confirm-email?token=${rawToken}&email=${encodeURIComponent(email)}`;

    if (!process.env.MAILERSEND_API_KEY) {
      throw new Error("MAILERSEND_API_KEY is not defined");
    }

    const mailerSend = new MailerSend({
      apiKey: process.env.MAILERSEND_API_KEY,
    });

    try {
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
    } catch (sendError) {
      console.error("Error sending confirmation email:", sendError);
    }
  }

  await user.save();

  return {
    success: true,
    pendingEmail: user.pendingEmail || null,
  };
}
