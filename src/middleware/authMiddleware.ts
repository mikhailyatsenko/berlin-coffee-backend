import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { RequestWithUser } from "../../types/express";

export const authMiddleware = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies.jwt;
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
