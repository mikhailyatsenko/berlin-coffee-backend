import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { appError } from "../../errors.js";
import { Response } from "express";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";

/**
 * An unknown email, a mismatched one and a wrong token all read as the same
 * broken link, so the link reveals nothing about which emails are registered.
 */
const invalidLink = () =>
  appError("INVALID_TOKEN", "Invalid confirmation link");

export async function confirmEmailResolver(
  _: never,
  { token, email }: { token: string; email: string },
  { res }: { res: Response },
) {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Prefer lookup by current email; if not found, try by pendingEmail
  let user = (await User.findOne({ email })) as IUser | null;
  if (!user) {
    user = (await User.findOne({ pendingEmail: email })) as IUser | null;
  }
  if (!user) {
    throw invalidLink();
  }

  // Two flows with guard clauses: registration (no pendingEmail) vs email-change (has pendingEmail)
  const isEmailChange = Boolean(user.pendingEmail);
  if (isEmailChange && user.pendingEmail !== email) {
    throw invalidLink();
  }
  if (!isEmailChange && user.isEmailConfirmed) {
    throw appError("EMAIL_ALREADY_CONFIRMED", "Email is already confirmed");
  }
  if (!isEmailChange && user.email !== email) {
    throw invalidLink();
  }

  if (
    !user.emailConfirmationTokenExpires ||
    user.emailConfirmationTokenExpires < new Date()
  ) {
    throw appError("TOKEN_EXPIRED", "Confirmation link has expired");
  }

  if (user.emailConfirmationToken !== hashedToken) {
    throw invalidLink();
  }

  // If this is a pending email change, swap emails; otherwise mark confirmed
  if (isEmailChange) {
    user.email = user.pendingEmail!;
    user.pendingEmail = null;
    user.isEmailConfirmed = true;
  } else {
    user.isEmailConfirmed = true;
  }
  user.emailConfirmationToken = null;
  user.emailConfirmationTokenExpires = null;
  user.lastActive = new Date();
  await user.save();

  setAuthCookies(user._id.toString(), res);

  return {
    user: formatUserResponse(user),
    emailChanged: isEmailChange,
  };
}
