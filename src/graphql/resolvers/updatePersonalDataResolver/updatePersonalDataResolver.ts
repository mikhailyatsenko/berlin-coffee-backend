import User from "../../../models/User.js";
import isEmail from "validator/lib/isEmail.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { config } from "../../../config/config.js";
import {
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import { requireUser } from "../../context.js";
import { badInput, forbidden } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import { parseDisplayName } from "../../../utils/validateInput.js";

export const updatePersonalDataResolver: MutationResolvers["updatePersonalData"] =
  async (_parent, { userId, displayName, email: rawEmail }, context) => {
    const user = requireUser(context);
    if (user.id !== userId) {
      throw forbidden("You can only change your own profile");
    }

    // Absent or the current name means "no change", so a name from before the
    // length limit doesn't block an email change; an empty name is refused.
    if (displayName != null && displayName.trim() !== user.displayName) {
      user.displayName = parseDisplayName(displayName);
    }
    // A blank address still reaches isEmail and is rejected there.
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (email !== null && email !== user.email) {
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

      const confirmationUrl = `${config.frontendUrl}/confirm-email?token=${rawToken}&email=${encodeURIComponent(email)}`;

      const mailerSend = new MailerSend({
        apiKey: config.mailerSendApiKey,
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
  };
