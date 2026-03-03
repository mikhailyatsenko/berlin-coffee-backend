import { GraphQLError } from "graphql";
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
    throw new GraphQLError("No refresh token provided", {
      extensions: {
        code: "UNAUTHENTICATED",
      },
    });
  }

  const result = await refreshAccessToken(refreshToken, res);

  if (!result) {
    throw new GraphQLError("Invalid or expired refresh token", {
      extensions: {
        code: "UNAUTHENTICATED",
      },
    });
  }

  return {
    accessToken: result.accessToken,
    user: formatUserResponse(result.user),
  };
}
