import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import isEmail from "validator/lib/isEmail.js";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { env } from "../../../utils/env.utils.js";

interface RegisterUserArgs {
  email: string;
  displayName: string;
  password: string;
}

export async function registerUserResolver(
  _: never,
  { email, displayName, password }: RegisterUserArgs,
) {
  if (!isEmail(email)) {
    throw new GraphQLError("Invalid email address");
  }

  if (password.length < 8) {
    throw new GraphQLError("Password must be at least 8 characters long");
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new GraphQLError("User already exists with this email.", {
        extensions: {
          code: "BAD_USER_INPUT",
          message: "User already exists with this email.",
        },
      });
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
          .setSubject("Welcome to 3.Welle - Confirm your email")
          .setHtml(
            `<p>Hi there!</p>
          <p>Thank you for registering with <strong>3.Welle</strong>! To complete your account setup, please confirm your email address.</p>
          <p><a href="${confirmationUrl}">Confirm your email</a></p>
          <p>This link is valid for 1 hour. If you didn't create an account with 3.Welle, please ignore this email.</p>
          <p>Best regards,<br>The 3.Welle Team</p>`,
          )
          .setText(`Hi there!

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
  } catch (error) {
    console.error("Error registering user:", error);
    if (error instanceof GraphQLError) {
      throw error;
    } else {
      throw new GraphQLError("Error registering user.", {
        extensions: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Error registering user.",
        },
      });
    }
  }
}
