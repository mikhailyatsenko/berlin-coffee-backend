import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { badInput } from "../../errors.js";
import isEmail from "validator/lib/isEmail.js";
import crypto from "crypto";
import { addHours } from "date-fns";
import { config } from "../../../config/config.js";
import { sendEmailConfirmation } from "../../../mail/mail.js";
import { clientIp } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import {
  assertNewPassword,
  parseDisplayName,
} from "../../../utils/validateInput.js";

export const registerUserResolver: MutationResolvers["registerUser"] = async (
  _parent,
  { email: rawEmail, displayName: rawDisplayName, password, captchaToken },
  { req },
) => {
  await verifyRecaptcha(captchaToken ?? "", "register_user", clientIp(req));

  const email = normalizeEmail(rawEmail);

  if (!isEmail(email)) {
    throw badInput("Invalid email address");
  }

  const displayName = parseDisplayName(rawDisplayName);
  assertNewPassword(password);

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

  await sendEmailConfirmation(email, confirmationUrl);

  return {
    success: true,
  };
};
