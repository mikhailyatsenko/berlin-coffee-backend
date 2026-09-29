import type { MutationResolvers } from "../../generated/types.js";

export const logoutResolver: MutationResolvers["logout"] = async (
  _parent,
  _args,
  { res },
) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
    domain: process.env.NODE_ENV === "production" ? "api.3welle.com" : "localhost",
    path: "/",
  };

  // Clear access token (jwt)
  res.clearCookie("jwt", cookieOptions);

  // Clear refresh token
  res.clearCookie("refreshToken", cookieOptions);

  return { message: "Logged out successfully" };
};
