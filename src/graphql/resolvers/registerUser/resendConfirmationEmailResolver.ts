import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { GraphQLError } from "graphql";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import { addHours } from "date-fns";
import { env } from "../../../utils/env.utils.js";

export async function resendConfirmationEmailResolver(
  _: never,
  { email }: { email: string },
) {
  const user = (await User.findOne({ email })) as IUser;
  if (!user) {
    throw new GraphQLError("User with this email does not exist.");
  }
  if (user.isEmailConfirmed) {
    throw new GraphQLError("Email is already confirmed.");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const tokenExpires = addHours(new Date(), 1); // TTL 1 час

  user.emailConfirmationToken = hashedToken;
  user.emailConfirmationTokenExpires = tokenExpires;
  await user.save();

  const confirmationUrl = `${env.frontendUrl}/confirm-email?token=${rawToken}&email=${encodeURIComponent(email)}`;

  if (!process.env.MAILERSEND_API_KEY) {
    throw new Error("MAILERSEND_API_KEY is not defined");
  }
  const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY,
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
}
