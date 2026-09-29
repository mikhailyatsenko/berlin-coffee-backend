import type { Request, Response } from "express";
import type { Context } from "./context.js";
import {
  getUserFromAccessToken,
  refreshAccessToken,
  clearAuthCookies,
} from "../utils/tokenUtils.js";
import { updateLastActive } from "../utils/updateLastActive.js";
import { guestContextFromRequest } from "../utils/guestAuth.js";

/**
 * The context of one `/coffee` request: the signed-in User, if the auth
 * cookies name a live Session, or else the Guest, if the request carries a
 * Guest identity. An expired access token is replaced from the refresh token.
 */
export async function buildContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<Context> {
  const accessToken: string | undefined = req.cookies?.jwt;
  const refreshToken: string | undefined = req.cookies?.refreshToken;

  const user =
    (await getUserFromAccessToken(accessToken)) ??
    (await refreshAccessToken(refreshToken, res))?.user ??
    null;

  if (user) {
    await updateLastActive(user);
  } else if (accessToken || refreshToken) {
    // Only a token that came in and failed (invalid, expired or revoked):
    // an anonymous request has nothing to clear.
    clearAuthCookies(res);
  }

  // Resolved once here rather than per resolver: a single operation can
  // touch several of them, and each would otherwise repeat the lookup.
  // Skipped entirely for signed-in Users, whose account is the identity.
  const guest = user ? undefined : await guestContextFromRequest(req);

  return { user, guest, req, res };
}
