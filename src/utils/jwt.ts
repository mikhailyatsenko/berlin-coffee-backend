import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import type { IUser } from "../models/User.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/** Who a token belongs to: the User and the Session version it was issued for. */
type SessionOwner = Pick<IUser, "_id" | "sessionVersion">;

export type TokenType = "access" | "refresh";

export interface TokenPayload {
  id: string;
  type: TokenType;
  sessionVersion: number;
}

const sign = ({ _id, sessionVersion }: SessionOwner, type: TokenType) =>
  jwt.sign({ id: _id.toString(), type, sessionVersion }, config.jwtSecret, {
    expiresIn: type === "access" ? ACCESS_TOKEN_EXPIRY : REFRESH_TOKEN_EXPIRY,
  });

export const createAccessToken = (owner: SessionOwner): string =>
  sign(owner, "access");

export const createRefreshToken = (owner: SessionOwner): string =>
  sign(owner, "refresh");

/**
 * The payload of a valid token of this type, or null. A token of the other
 * type, or one issued before Sessions carried a version, is not valid.
 */
export const verifyTokenOfType = (
  token: string,
  type: TokenType,
): TokenPayload | null => {
  let payload: unknown;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
  const { id, type: actualType, sessionVersion } = (payload ?? {}) as Partial<TokenPayload>;
  if (typeof id !== "string" || actualType !== type) return null;
  if (typeof sessionVersion !== "number") return null;
  return { id, type, sessionVersion };
};
