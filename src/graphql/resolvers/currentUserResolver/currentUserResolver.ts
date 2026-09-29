import type { QueryResolvers } from "../../generated/types.js";

export const currentUserResolver: QueryResolvers["currentUser"] = async (
  _parent,
  _args,
  { user },
) => {
  if (user) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      lastActive: user.lastActive ? user.lastActive.toISOString() : null,
      isGoogleUserUserWithoutPassword: !!user.googleId && !user.password,
    };
  }
  return null;
};
