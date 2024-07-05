import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { IUser } from "../models/User.js";

export interface IGoogleUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/auth/google/callback",
);

export const generateAuthUrl = (): string => {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
};

export const getGoogleOAuthTokens = async (code: string) => {
  const { tokens } = await client.getToken(code);
  return tokens;
};

export const getGoogleUserInfo = async (
  idToken: string,
): Promise<IGoogleUser> => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return payload as IGoogleUser;
};

export const findOrCreateUser = async (
  googleUser: IGoogleUser,
): Promise<IUser> => {
  let user = await User.findOne({ googleId: googleUser.sub });

  if (!user) {
    user = new User({
      googleId: googleUser.sub,
      displayName: googleUser.name,
      email: googleUser.email,
      avatar: googleUser.picture,
    });
    await user.save();
  }

  return user;
};
