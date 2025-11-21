import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { Response } from "express";
import { env } from "../../../utils/env.utils.js";

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
    throw new GraphQLError("User not found", {
      extensions: {
        code: "USER_NOT_FOUND",
      },
    });
  }

  // Two flows with guard clauses: registration (no pendingEmail) vs email-change (has pendingEmail)
  const isEmailChange = Boolean(user.pendingEmail);
  if (isEmailChange && user.pendingEmail !== email) {
    throw new GraphQLError("Invalid email", {
      extensions: { code: "INVALID_EMAIL" },
    });
  }
  if (!isEmailChange && user.isEmailConfirmed) {
    throw new GraphQLError("Email is already confirmed", {
      extensions: { code: "EMAIL_ALREADY_CONFIRMED" },
    });
  }
  if (!isEmailChange && user.email !== email) {
    throw new GraphQLError("Invalid email", {
      extensions: { code: "INVALID_EMAIL" },
    });
  }

  if (
    !user.emailConfirmationTokenExpires ||
    user.emailConfirmationTokenExpires < new Date()
  ) {
    throw new GraphQLError("Confirmation link has expired", {
      extensions: {
        code: "TOKEN_EXPIRED",
      },
    });
  }

  if (user.emailConfirmationToken !== hashedToken) {
    throw new GraphQLError("Invalid confirmation link", {
      extensions: {
        code: "INVALID_TOKEN",
      },
    });
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

  const jwtToken = jwt.sign(
    { id: user._id, email: user.email },
    env.jwtSecret,
    { expiresIn: "2d" },
  );

  res.cookie("jwt", jwtToken, env.cookieSettings);

  return {
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
      lastActive: user.lastActive ? user.lastActive.toISOString() : null,
      isGoogleUserUserWithoutPassword: false,
    },
    emailChanged: isEmailChange,
  };
}
