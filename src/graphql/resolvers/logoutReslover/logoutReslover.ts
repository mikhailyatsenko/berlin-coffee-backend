import { clearAuthCookies } from "../../../utils/tokenUtils.js";
import type { MutationResolvers } from "../../generated/types.js";

export const logoutResolver: MutationResolvers["logout"] = async (
  _parent,
  _args,
  { res },
) => {
  clearAuthCookies(res);

  return { message: "Logged out successfully" };
};
