import { GraphQLError } from "graphql";
import User, { IUser } from "../../../models/User.js";
import isEmail from "validator/lib/isEmail.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { env } from "../../../utils/env.utils.js";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";

export async function updatePersonalDataResolver(
  _: never,
  {
    userId,
    displayName,
    email,
  }: { userId: string; displayName?: string; email?: string },
  context: { user?: IUser },
) {
  try {
    if (!context.user || context.user.id !== userId) {
      throw new GraphQLError("Unauthorized", {
        extensions: {
          code: "UNAUTHORIZED",
        },
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: {
          code: "NOT_FOUND",
        },
      });
    }

    if (displayName) {
      user.displayName = displayName;
    }
    if (email && email !== user.email) {
      if (!isEmail(email)) {
        throw new GraphQLError("Invalid email address", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser && String(existingUser._id) !== String(user._id)) {
        throw new GraphQLError("User already exists with this email.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
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
        throw new GraphQLError("MAILERSEND_API_KEY is not defined", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
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
            .setText(
              `Confirm your email: ${confirmationUrl} (valid for 1 hour)`,
            ),
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
  } catch (error) {
    console.error("Error updating profile:", error);
    throw new GraphQLError("Error updating profile", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
