import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { Response } from "express";
import { updateLastActive } from "../../../utils/updateLastActive.js";

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

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "14d" },
    );

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      domain:
        process.env.NODE_ENV === "production" ? "yatsenko.site" : "localhost",
      path: "/",
    });

    await updateLastActive(user, { force: true });

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        lastActive: user.lastActive ? user.lastActive.toISOString() : null,
        isGoogleUserUserWithoutPassword: false,
      },
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
