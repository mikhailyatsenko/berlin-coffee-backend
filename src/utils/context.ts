// context.ts
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "src/models/User";

export interface Context {
  req: Request;
  res: Response;
}

export const context = async ({
  req,
  res,
}: {
  req: Request;
  res: Response;
}) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const { userId } = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
      };
      const user = await User.findById(userId);
      return { user, res };
    } catch (e) {
      console.error("Error verifying token:", e);
    }
  }
  return { res };
};
