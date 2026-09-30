import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { appError } from "../../errors.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";

/**
 * A wrong token and a token paired with another address read as the same
 * broken link, so the link reveals nothing about which emails are registered.
 */
const invalidLink = () =>
  appError("INVALID_TOKEN", "Invalid confirmation link");

const emailTaken = () =>
  appError("EMAIL_TAKEN", "This email now belongs to another account");

const clearConfirmation = (user: IUser) => {
  user.emailConfirmationToken = null;
  user.emailConfirmationTokenExpires = null;
};

const isDuplicateEmail = (error: unknown) => {
  const { code, keyPattern } = error as {
    code?: unknown;
    keyPattern?: Record<string, unknown>;
  };
  return code === 11000 && keyPattern?.email !== undefined;
};

/**
 * Nothing reserves a pending address: it goes to whoever proves the mailbox
 * first. A confirmed owner keeps it and the change is cancelled; an
 * unconfirmed one never proved it, so that account gives way.
 */
const changeEmail = async (user: IUser, email: string) => {
  const owner = await User.findOne({ email });
  if (owner?.isEmailConfirmed) {
    user.pendingEmail = null;
    clearConfirmation(user);
    await user.save();
    throw emailTaken();
  }
  if (owner) {
    await owner.deleteOne();
  }

  user.email = email;
  user.pendingEmail = null;
  user.isEmailConfirmed = true;
  clearConfirmation(user);
  user.lastActive = new Date();
  try {
    await user.save();
  } catch (error) {
    if (!isDuplicateEmail(error)) throw error;
    // Taken between the check and the save. The in-memory copy already holds
    // the new email, so the cancel goes straight to the stored one.
    await User.updateOne(
      { _id: user._id },
      {
        pendingEmail: null,
        emailConfirmationToken: null,
        emailConfirmationTokenExpires: null,
      },
    );
    throw emailTaken();
  }
};

export const confirmEmailResolver: MutationResolvers["confirmEmail"] = async (
  _parent,
  { token, email: rawEmail },
  { res },
) => {
  const email = normalizeEmail(rawEmail);
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // By token, not by address: several Users may be pending the same address.
  const user = (await User.findOne({
    emailConfirmationToken: hashedToken,
  })) as IUser | null;
  if (!user) {
    throw invalidLink();
  }

  // Two flows: registration (no pendingEmail) vs email change (has pendingEmail)
  const isEmailChange = Boolean(user.pendingEmail);
  if (email !== (isEmailChange ? user.pendingEmail : user.email)) {
    throw invalidLink();
  }
  if (!isEmailChange && user.isEmailConfirmed) {
    throw appError("EMAIL_ALREADY_CONFIRMED", "Email is already confirmed");
  }

  if (
    !user.emailConfirmationTokenExpires ||
    user.emailConfirmationTokenExpires < new Date()
  ) {
    throw appError("TOKEN_EXPIRED", "Confirmation link has expired");
  }

  if (isEmailChange) {
    await changeEmail(user, email);
  } else {
    user.isEmailConfirmed = true;
    clearConfirmation(user);
    user.lastActive = new Date();
    await user.save();
  }

  setAuthCookies(user, res);

  return {
    user: formatUserResponse(user),
    emailChanged: isEmailChange,
  };
};
