import { Response } from "express";
import { GraphQLError } from "graphql";

export async function logoutResolver(
  _: never,
  __: never,
  { res }: { res: Response },
) {
  try {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
      domain: process.env.NODE_ENV === "production" ? "yatsenko.site" : "localhost",
      path: "/",
    };

    // Clear access token (jwt)
    res.clearCookie("jwt", cookieOptions);

    // Clear refresh token
    res.clearCookie("refreshToken", cookieOptions);

    return { message: "Logged out successfully" };
  } catch (error) {
    console.error("Error clearing cookie:", error);
    throw new GraphQLError("Error logging out", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
