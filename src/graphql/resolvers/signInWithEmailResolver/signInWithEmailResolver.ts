import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import { Response } from "express";
import { updateLastActive } from "../../../utils/updateLastActive.js";
import { setAuthCookies, formatUserResponse } from "../../../utils/authHelpers.js";

interface signInWithEmailArgs {
  email: string;
  password: string;
}

export async function signInWithEmailResolver(
  _: never,
  { email, password }: signInWithEmailArgs,
  { res }: { res: Response },
) {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      throw new GraphQLError("Invalid e-mail or password", {
        extensions: {
          code: "BAD_USER_INPUT",
        },
      });
    }

    if (user.googleId && !user.password) {
      throw new GraphQLError(
        "This email is associated with a Google account and does not have a password",
        {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        },
      );
    }

    if (user.password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new GraphQLError("Invalid e-mail or password", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        });
      }
      if (isPasswordValid && !user.isEmailConfirmed) {
        throw new GraphQLError("Please confirm your email before logging in.", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        });
      }
    } else {
      throw new GraphQLError("Password is required", {
        extensions: {
          code: "BAD_USER_INPUT",
        },
      });
    }

    setAuthCookies(user._id.toString(), res);
    await updateLastActive(user, { force: true });

    return {
      user: formatUserResponse(user),
    };
  } catch (error) {
    console.error("Error logging in:", error);
    const errorMessage = (error as Error).message || "Error logging in.";
    throw new GraphQLError(errorMessage, {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
      },
    });
  }
}
