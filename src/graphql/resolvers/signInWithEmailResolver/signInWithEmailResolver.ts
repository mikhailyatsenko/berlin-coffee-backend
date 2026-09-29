import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { updateLastActive } from "../../../utils/updateLastActive.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";
import { badInput } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";
import { normalizeEmail } from "../../../utils/normalizeEmail.js";
import {
  checkRateLimit,
  clientIp,
  consumeRateLimit,
  countRateLimit,
  emailKey,
} from "../../../utils/rateLimit.js";

export const signInWithEmailResolver: MutationResolvers["signInWithEmail"] = async (
  _parent,
  { email, password },
  { req, res },
) => {
  consumeRateLimit("signIn", clientIp(req));
  // Checked before bcrypt, so a guessed-out account costs no hashing.
  const failures = emailKey(email);
  checkRateLimit("signInFailure", failures);

  // One answer for an unknown address, a Google-only account and a wrong
  // password, so none of them tells which accounts exist.
  const fail = () => {
    countRateLimit("signInFailure", failures);
    return badInput("Invalid e-mail or password");
  };

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user?.password) {
    throw fail();
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw fail();
  }
  if (!user.isEmailConfirmed) {
    throw badInput("Please confirm your email before logging in.");
  }

  setAuthCookies(user, res);
  await updateLastActive(user, { force: true });

  return {
    user: formatUserResponse(user),
  };
};
