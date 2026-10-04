import { OAuth2Client } from "google-auth-library";
import User from "../../../models/User.js";
import { badInput } from "../../errors.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";
import type { MutationResolvers } from "../../generated/types.js";
import { config } from "../../../config/config.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";

const client = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.frontendUrl,
);

export const loginWithGoogleResolver: MutationResolvers["loginWithGoogle"] = async (
  _parent,
  { code },
  { res },
) => {
  const { tokens } = await client.getToken({
    code,
    redirect_uri: config.frontendUrl,
  });
  const idToken = tokens.id_token;

  if (!idToken) {
    throw badInput("Invalid Google token");
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw badInput("Invalid Google token");
  }

  if (payload.email_verified !== true || !payload.email) {
    throw badInput("Please verify your email in your Google account first.");
  }
  const email = normalizeEmail(payload.email);

  // What Google tells about the person, for a User it creates or takes over.
  const fromGoogle = {
    googleId: payload.sub,
    isEmailConfirmed: true,
    displayName: payload.name,
    avatar: payload.picture,
  };

  let user = await User.findOne({ googleId: payload.sub });
  let isFirstLogin = false;

  if (!user) {
    user = await User.findOne({ email });
    isFirstLogin = !user?.isEmailConfirmed;

    if (!user) {
      user = new User({ ...fromGoogle, email });
    } else if (user.googleId) {
      throw badInput("This email is linked to another Google account.");
    } else if (user.isEmailConfirmed) {
      // The User proved the mailbox before: Google becomes a second way in.
      user.googleId = payload.sub;
      user.avatar ||= payload.picture;
    } else {
      // An unconfirmed email does not hold the address: Google proved the
      // mailbox, so the password and pending tokens of the User are dropped.
      user.set({
        ...fromGoogle,
        password: null,
        emailConfirmationToken: null,
        emailConfirmationTokenExpires: null,
        passwordResetToken: null,
        passwordResetTokenExpires: null,
      });
    }
  }
  // A full save, not updateLastActive: a first sign-in creates the User here.
  user.lastActive = new Date();
  await user.save();

  setAuthCookies(user, res);

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      lastActive: user.lastActive ? user.lastActive.toISOString() : null,
      isGoogleUserUserWithoutPassword: !!user.googleId && !user.password,
    },
    isFirstLogin,
  };
};
