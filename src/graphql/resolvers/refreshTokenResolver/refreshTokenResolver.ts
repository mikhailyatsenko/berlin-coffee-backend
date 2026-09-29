import { appError } from "../../errors.js";
import { Response, Request } from "express";
import { refreshAccessToken } from "../../../utils/tokenUtils.js";
import { formatUserResponse } from "../../../utils/authHelpers.js";

export async function refreshTokenResolver(
  _: never,
  _args: Record<string, never>,
  { req, res }: { req: Request; res: Response },
) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw appError("UNAUTHENTICATED", "No refresh token provided");
  }

  const result = await refreshAccessToken(refreshToken, res);

  if (!result) {
    throw appError("UNAUTHENTICATED", "Invalid or expired refresh token");
  }

  return {
    accessToken: result.accessToken,
    user: formatUserResponse(result.user),
  };
}
