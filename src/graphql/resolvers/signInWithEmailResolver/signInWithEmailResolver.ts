import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { Response } from "express";
import { updateLastActive } from "../../../utils/updateLastActive.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";
import { badInput } from "../../errors.js";

interface signInWithEmailArgs {
  email: string;
  password: string;
}

export async function signInWithEmailResolver(
  _: never,
  { email, password }: signInWithEmailArgs,
  { res }: { res: Response },
) {
  const user = await User.findOne({ email });
  if (!user) {
    throw badInput("Invalid e-mail or password");
  }

  if (user.googleId && !user.password) {
    throw badInput(
      "This email is associated with a Google account and does not have a password",
    );
  }

  if (!user.password) {
    throw badInput("Password is required");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw badInput("Invalid e-mail or password");
  }
  if (!user.isEmailConfirmed) {
    throw badInput("Please confirm your email before logging in.");
  }

  setAuthCookies(user._id.toString(), res);
  await updateLastActive(user, { force: true });

  return {
    user: formatUserResponse(user),
  };
}
