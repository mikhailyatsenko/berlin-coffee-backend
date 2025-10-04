import User from "../../../models/User.js";
import { GraphQLError } from "graphql";
import crypto from "crypto";
import { addHours } from "date-fns";
import { env } from "../../../utils/env.utils.js";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { FROM_EMAIL, FROM_NAME } from "../contactFormResolver/constants/index.js";

export async function requestPasswordResetResolver(
  _: never,
  { email }: { email: string },
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      const tokenExpires = addHours(new Date(), 1);

      user.passwordResetToken = hashedToken;
      user.passwordResetTokenExpires = tokenExpires;
      await user.save();

      const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

      if (!process.env.MAILERSEND_API_KEY) {
        throw new Error("MAILERSEND_API_KEY is not defined");
      }

      const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

      try {
        await mailerSend.email.send(
          new EmailParams()
            .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
            .setTo([new Recipient(normalizedEmail)])
            .setSubject("Reset your password on 3.Welle")
            .setHtml(
              `<p>You (or someone else) requested to reset the password for your 3.Welle account.</p>
               <p>If it was you, click <a href="${resetUrl}">this link</a> to set a new password. The link is valid for 1 hour.</p>
               <p>If you did not request this, you can safely ignore this message.</p>`,
            )
            .setText(
              `You requested to reset the password for your 3.Welle account.\n\nReset link: ${resetUrl}\nThis link is valid for 1 hour. If you didn't request this, ignore this email.`,
            ),
        );
      } catch (error) {
        console.error("Error sending reset password email:", error);
      }
    }

    // Always return success to prevent email enumeration
    return { success: true };
  } catch (error) {
    console.error("Error in requestPasswordReset:", error);
    throw new GraphQLError("Failed to process request", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
}



