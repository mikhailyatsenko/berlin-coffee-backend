import { OAuth2Client } from "google-auth-library";
import { Response } from "express";
import User from "../../../models/User.js";
import { badInput } from "../../errors.js";
import { updateLastActive } from "../../../utils/updateLastActive.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;

const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === "production"
    ? "https://3welle.com"
    : "http://localhost:5173",
);

export async function loginWithGoogleResolver(
  _: never,
  { code }: { code: string },
  { res }: { res: Response },
) {
  const { tokens } = await client.getToken({
    code,
    redirect_uri:
      process.env.NODE_ENV === "production"
        ? "https://3welle.com"
        : "http://localhost:5173",
  });
  const idToken = tokens.id_token;

  if (!idToken) {
    throw badInput("Invalid Google token");
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
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
      email: payload.email,
      isEmailConfirmed: true,
      displayName: payload.name,
      avatar: payload.picture,
    });
  }
  await updateLastActive(user, { force: true });

  setAuthCookies(user.id, res);

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_ENV === "production"
      ? "https://3welle.com"
      : "http://localhost:5173",
  );

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
}
