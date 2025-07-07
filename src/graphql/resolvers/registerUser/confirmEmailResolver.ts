import User, { IUser } from "../../../models/User.js";
import crypto from "crypto";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { Response } from "express";
import { env } from "../../../utils/env.utils.js";

export async function confirmEmailResolver(
  _: never,
  { token, email }: { token: string; email: string },
  { res }: { res: Response },
) {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Сначала проверяем существование пользователя
  const user = (await User.findOne({ email })) as IUser;
  if (!user) {
    throw new GraphQLError("User not found", {
      extensions: {
        code: "USER_NOT_FOUND",
      },
    });
  }

  // Проверяем, не подтверждён ли уже email
  if (user.isEmailConfirmed) {
    throw new GraphQLError("Email is already confirmed", {
      extensions: {
        code: "EMAIL_ALREADY_CONFIRMED",
      },
    });
  }

  // Проверяем срок действия токена
  if (
    !user.emailConfirmationTokenExpires ||
    user.emailConfirmationTokenExpires < new Date()
  ) {
    throw new GraphQLError("Confirmation link has expired", {
      extensions: {
        code: "TOKEN_EXPIRED",
      },
    });
  }

  // Проверяем валидность токена
  if (user.emailConfirmationToken !== hashedToken) {
    throw new GraphQLError("Invalid confirmation link", {
      extensions: {
        code: "INVALID_TOKEN",
      },
    });
  }

  // Если все проверки пройдены, подтверждаем email
  user.isEmailConfirmed = true;
  user.emailConfirmationToken = null;
  user.emailConfirmationTokenExpires = null;
  await user.save();

  // Создаем JWT токен
  const jwtToken = jwt.sign(
    { id: user._id, email: user.email },
    env.jwtSecret,
    { expiresIn: "2d" },
  );

  // Устанавливаем cookie
  res.cookie("jwt", jwtToken, env.cookieSettings);

  // Возвращаем данные пользователя
  return {
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
      isGoogleUserUserWithoutPassword: false,
    },
  };
}
