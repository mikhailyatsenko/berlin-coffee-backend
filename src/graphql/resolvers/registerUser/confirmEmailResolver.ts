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

/** What cancelling a pending email change stores. */
const CANCELLED_CHANGE = {
  pendingEmail: null,
  emailConfirmationToken: null,
  emailConfirmationTokenExpires: null,
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
 * first. A confirmed owner keeps it and the change is cancelled, even if the
 * link has expired, since a new one could never win; an unconfirmed owner
 * never proved it, so that account gives way.
 */
const applyEmailChange = async (user: IUser, email: string) => {
  // Straight to the stored User: the in-memory copy may already hold the new email.
  const cancel = async () => {
    await User.updateOne({ _id: user._id }, CANCELLED_CHANGE);
    return emailTaken();
  };

  const owner = await User.findOne({ email });
  if (owner?.isEmailConfirmed) {
    throw await cancel();
  }
  assertNotExpired(user);
  // Only while still unconfirmed: the owner may have confirmed since the lookup.
  if (
    owner &&
    (await User.deleteOne({ _id: owner._id, isEmailConfirmed: false }))
      .deletedCount === 0
  ) {
    throw await cancel();
  }

  user.set({ ...CANCELLED_CHANGE, email, isEmailConfirmed: true });
  user.lastActive = new Date();
  try {
    await user.save();
  } catch (error) {
    // Taken between the check and the save.
    if (!isDuplicateEmail(error)) throw error;
    throw await cancel();
  }
};

const assertNotExpired = (user: IUser) => {
  if (
    !user.emailConfirmationTokenExpires ||
    user.emailConfirmationTokenExpires < new Date()
  ) {
    throw appError("TOKEN_EXPIRED", "Confirmation link has expired");
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

  if (isEmailChange) {
    await applyEmailChange(user, email);
  } else {
    assertNotExpired(user);
    user.isEmailConfirmed = true;
    user.emailConfirmationToken = null;
    user.emailConfirmationTokenExpires = null;
    user.lastActive = new Date();
    await user.save();
  }

  setAuthCookies(user, res);

  return {
    user: formatUserResponse(user),
    emailChanged: isEmailChange,
  };
};
