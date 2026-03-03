import { Response } from "express";
import { IUser } from "../models/User.js";
import { createAccessToken, createRefreshToken } from "./jwt.js";
import { env } from "./env.utils.js";

/**
 * Set both access and refresh token cookies
 */
export const setAuthCookies = (userId: string, res: Response): void => {
  const accessToken = createAccessToken(userId);
  const refreshToken = createRefreshToken(userId);

  res.cookie("jwt", accessToken, env.accessTokenCookieSettings);
  res.cookie("refreshToken", refreshToken, env.refreshTokenCookieSettings);
};

/**
 * Format user data for GraphQL response
 */
export const formatUserResponse = (user: IUser) => ({
  id: user.id,
  displayName: user.displayName,
  email: user.email,
  avatar: user.avatar,
  createdAt: user.createdAt ? user.createdAt.toISOString() : null,
  lastActive: user.lastActive ? user.lastActive.toISOString() : null,
  isGoogleUserUserWithoutPassword: !!user.googleId && !user.password,
});
