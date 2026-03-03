import jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export const createAccessToken = (userId: string): string => {
  return jwt.sign({ id: userId, type: "access" }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

export const createRefreshToken = (userId: string): string => {
  return jwt.sign({ id: userId, type: "refresh" }, process.env.JWT_SECRET!, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
};

// Legacy function for backwards compatibility
export const createJWT = (userId: string): string => {
  return createAccessToken(userId);
};
