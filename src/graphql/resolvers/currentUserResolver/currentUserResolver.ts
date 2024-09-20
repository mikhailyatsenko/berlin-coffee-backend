import { IUser } from "src/models/User";

export async function currentUserResolver(
  _: never,
  __: never,
  { user }: { user: IUser },
) {
  if (user) {
    return user;
  }
  return null;
}
