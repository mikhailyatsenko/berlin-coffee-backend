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

  let user = await User.findOne({ googleId: payload.sub });

  const isFirstLogin = !user;

  if (!user) {
    user = new User({
      googleId: payload.sub,
      email: payload.email && normalizeEmail(payload.email),
      isEmailConfirmed: true,
      displayName: payload.name,
      avatar: payload.picture,
    });
  }
  // A full save, not updateLastActive: a first sign-in creates the User here.
  user.lastActive = new Date();
  await user.save();

  setAuthCookies(user, res);

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", config.frontendUrl);

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
