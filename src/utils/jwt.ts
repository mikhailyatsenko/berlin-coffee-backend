import jwt from "jsonwebtoken";
import { config } from "../config/config.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export const createAccessToken = (userId: string): string => {
  return jwt.sign({ id: userId, type: "access" }, config.jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

export const createRefreshToken = (userId: string): string => {
  return jwt.sign({ id: userId, type: "refresh" }, config.jwtSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
};

// Legacy function for backwards compatibility
export const createJWT = (userId: string): string => {
  return createAccessToken(userId);
};
