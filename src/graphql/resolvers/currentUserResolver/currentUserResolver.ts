import { IUser } from "src/models/User";

export async function currentUserResolver(
  _: never,
  __: never,
  { user }: { user: IUser },
) {
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
}
