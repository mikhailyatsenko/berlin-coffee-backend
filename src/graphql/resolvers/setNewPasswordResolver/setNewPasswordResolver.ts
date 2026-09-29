import bcrypt from "bcrypt";
import { type Context, requireUser } from "../../context.js";
import { badInput, forbidden } from "../../errors.js";

export async function setNewPasswordResolver(
  _: never,
  {
    userId,
    oldPassword,
    newPassword,
  }: { userId: string; oldPassword?: string; newPassword: string },
  context: Context,
) {
  const user = requireUser(context);
  if (user.id !== userId) {
    throw forbidden("You can only change your own password");
  }

  if (!user.googleId && !user.password) {
    throw new Error(`User ${user.id} has neither a password nor a Google id`);
  }

  if (user.password) {
    const isMatch = await bcrypt.compare(oldPassword || "", user.password);
    if (!isMatch) {
      throw badInput("Old password is incorrect");
    }
  }

  if (newPassword.length < 8) {
    throw badInput("Password must be at least 8 characters long");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return {
    success: true,
  };
}
