import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { badInput } from "../../errors.js";
import isEmail from "validator/lib/isEmail.js";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import { clientIp } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";

export const registerUserResolver: MutationResolvers["registerUser"] = async (
  _parent,
  { email, displayName, password, captchaToken },
  { req },
) => {
  await verifyRecaptcha(captchaToken ?? "", "register_user", clientIp(req));

  if (!isEmail(email)) {
    throw badInput("Invalid email address");
  }

  if (password.length < 8) {
    throw badInput("Password must be at least 8 characters long");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw badInput("User already exists with this email.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const tokenExpires = addHours(new Date(), 1); // TTL 1 hour

  const newUser = new User({
    email,
    password: hashedPassword,
    displayName,
    isEmailConfirmed: false,
    emailConfirmationToken: hashedToken,
    emailConfirmationTokenExpires: tokenExpires,
  });

  await newUser.save();

  const confirmationUrl = `${config.frontendUrl}/confirm-email?token=${rawToken}&email=${encodeURIComponent(email)}`;

  const mailerSend = new MailerSend({
    apiKey: config.mailerSendApiKey,
  });

  try {
    await mailerSend.email.send(
      new EmailParams()
        .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
        .setTo([new Recipient(email)])
        .setSubject("Welcome to 3.Welle - Confirm your email")
        .setHtml(
          `<p>Hi there!</p>
        <p>Thank you for registering with <strong>3.Welle</strong>! To complete your account setup, please confirm your email address.</p>
        <p><a href="${confirmationUrl}">Confirm your email</a></p>
        <p>This link is valid for 1 hour. If you didn't create an account with 3.Welle, please ignore this email.</p>
        <p>Best regards,<br>The 3.Welle Team</p>`,
        ).setText(`Hi there!

Thank you for registering with 3.Welle! To complete your account setup and start exploring bars in Berlin, please confirm your email address.

Confirm your email: ${confirmationUrl} (valid for 1 hour)

If you didn't create an account with 3.Welle, please ignore this email.

Best regards,
The 3.Welle Team`),
    );
  } catch (error) {
    console.error("Error sending email:", error);
  }

  return {
    success: true,
  };
};
