import User from "../../../models/User.js";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import isEmail from "validator/lib/isEmail.js";
import jwt from "jsonwebtoken";
import { Response } from "express";

interface RegisterUserArgs {
  email: string;
  displayName: string;
  password: string;
}

export async function registerUserResolver(
  _: never,
  { email, displayName, password }: RegisterUserArgs,
  { res }: { res: Response },
) {
  if (!isEmail(email)) {
    throw new GraphQLError("Invalid email address");
  }

  if (password.length < 8) {
    throw new GraphQLError("Password must be at least 8 characters long");
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new GraphQLError("User already exists with this email.", {
        extensions: {
          code: "BAD_USER_INPUT",
          message: "User already exists with this email.",
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      password: hashedPassword,
      displayName,
    });

    await newUser.save();

    // Создание токена
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET!,
      { expiresIn: "2d" },
    );

    // Сохранение токена в куках
    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000 * 2, // 2 days
    });

    return {
      user: {
        id: newUser._id,
        email: newUser.email,
        displayName: newUser.displayName,
      },
    };
  } catch (error) {
    console.error("Error registering user:", error);
    if (error instanceof GraphQLError) {
      throw error;
    } else {
      throw new GraphQLError("Error registering user.", {
        extensions: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Error registering user.",
        },
      });
    }
  }
}
