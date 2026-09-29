import { Response } from "express";
import User, { IUser } from "../models/User.js";
import { createAccessToken, verifyTokenOfType, type TokenType } from "./jwt.js";
import { config } from "../config/config.js";

/**
 * The User a token of this type belongs to, or null when the token is invalid,
 * expired or revoked: a password change or reset moves the User's
 * `sessionVersion` past the one the token carries.
 */
const userFromToken = async (
  token: string | undefined,
  type: TokenType,
): Promise<IUser | null> => {
  if (!token) return null;

  const payload = verifyTokenOfType(token, type);
  if (!payload) return null;

  const user = await User.findById(payload.id);
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;
  return user;
};

/** The User whose live Session this access token belongs to, or null. */
export const getUserFromAccessToken = (
  accessToken: string | undefined,
): Promise<IUser | null> => userFromToken(accessToken, "access");

/**
 * Issues a new access token cookie for the User whose live Session this
 * refresh token belongs to. The refresh token itself is not renewed, so a
 * Session still ends 7 days after sign-in. Null if the Session is not live.
 */
export const refreshAccessToken = async (
  refreshToken: string | undefined,
  res: Response,
): Promise<{ user: IUser; accessToken: string } | null> => {
  const user = await userFromToken(refreshToken, "refresh");
  if (!user) return null;

  const newAccessToken = createAccessToken(user);
  res.cookie("jwt", newAccessToken, config.accessTokenCookie);

  return { user, accessToken: newAccessToken };
};

/**
 * Clear both auth cookies
 */
export const clearAuthCookies = (res: Response): void => {
  res.clearCookie("jwt", config.authCookie);
  res.clearCookie("refreshToken", config.authCookie);
};
