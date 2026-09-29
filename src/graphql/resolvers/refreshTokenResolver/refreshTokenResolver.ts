import { appError } from "../../errors.js";
import { refreshAccessToken } from "../../../utils/tokenUtils.js";
import { formatUserResponse } from "../../../utils/authHelpers.js";
import type { MutationResolvers } from "../../generated/types.js";

export const refreshTokenResolver: MutationResolvers["refreshToken"] = async (
  _parent,
  _args,
  { req, res },
) => {
  const refreshToken = req?.cookies.refreshToken;

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
};
