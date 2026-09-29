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
  // Checked before bcrypt, so a guessed-out address costs no hashing.
  const failureKey = emailKey(email);
  checkRateLimit("signInFailure", failureKey);

  // One answer for an unknown address, a Google-only User and a wrong
  // password, so none of them tells which Users exist.
  const failedAttempt = () => {
    countRateLimit("signInFailure", failureKey);
    return badInput("Invalid e-mail or password");
  };

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user?.password) {
    throw failedAttempt();
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw failedAttempt();
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
