import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { Response } from "express";

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
    // Найдите пользователя по email
    const user = await User.findOne({ email });
    if (!user) {
      throw new GraphQLError("Invalid email or password", {
        extensions: {
          code: "BAD_USER_INPUT",
        },
      });
    }

    // Проверка, зарегистрирован ли пользователь через Google
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

    // Сравните хэшированный пароль с введенным паролем
    if (user.password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new GraphQLError("Invalid email or password", {
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

    // Создание токена
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "2d" },
    );

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000 * 2, // 2 days
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
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
