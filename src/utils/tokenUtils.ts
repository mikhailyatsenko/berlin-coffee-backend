import jwt from "jsonwebtoken";
import { Response } from "express";
import User, { IUser } from "../models/User.js";
import { createAccessToken } from "./jwt.js";
import { env } from "./env.utils.js";

interface TokenPayload {
  id: string;
  type?: "access" | "refresh";
}

/**
 * Verify and decode token safely
 */
const verifyTokenPayload = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
};

/**
 * Get user from access token only
 */
export const getUserFromAccessToken = async (
  accessToken: string | undefined
): Promise<IUser | null> => {
  if (!accessToken) return null;
  
  const payload = verifyTokenPayload(accessToken);
  if (!payload || payload.type !== "access") return null;

  return User.findById(payload.id);
};

/**
 * Get user from any valid token (used for legacy endpoints)
 */
export const getUserFromToken = async (
  token: string | undefined
): Promise<IUser | null> => {
  if (!token) return null;
  
  const payload = verifyTokenPayload(token);
  if (!payload) return null;

  return User.findById(payload.id);
};

/**
 * Refresh access token using refresh token
 * Creates new access token and sets it in cookie
 * Returns user and new access token if successful, null otherwise
 */
export const refreshAccessToken = async (
  refreshToken: string | undefined,
  res: Response
): Promise<{ user: IUser; accessToken: string } | null> => {
  if (!refreshToken) return null;
  
  const payload = verifyTokenPayload(refreshToken);
  if (!payload || payload.type !== "refresh") return null;

  const user = await User.findById(payload.id);
  if (!user) return null;

  // Issue new access token
  const newAccessToken = createAccessToken(user.id.toString());
  res.cookie("jwt", newAccessToken, env.accessTokenCookieSettings);

  return { user, accessToken: newAccessToken };
};

/**
 * Clear both auth cookies
 */
export const clearAuthCookies = (res: Response): void => {
  res.clearCookie("jwt", {
    path: "/",
    domain: env.cookieDomain,
  });
  res.clearCookie("refreshToken", {
    path: "/",
    domain: env.cookieDomain,
  });
};
