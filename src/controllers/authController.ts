import { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService.js";
import { createJWT } from "../utils/jwt.js";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const googleAuth = (req: Request, res: Response) => {
  const url = authService.generateAuthUrl();
  res.redirect(url);
};

export const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = req.query.code as string;
    const { id_token } = await authService.getGoogleOAuthTokens(code);
    const googleUser = await authService.getGoogleUserInfo(id_token!);

    const user = await authService.findOrCreateUser(googleUser);

    const token = createJWT(user.id);
    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // или 'lax', в зависимости от ваших требований
    });
    res.redirect("http://localhost:5173");
  } catch (error) {
    next(error);
  }
};

export const checkAuth = async (req: Request, res: Response) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };
    const user = await User.findById(decoded.id);
    if (user) {
      res.json({
        isAuthenticated: true,
        user: {
          id: user._id,
          displayName: user.displayName,
          email: user.email,
          avatar: user.avatar,
        },
      });
    } else {
      res.json({ isAuthenticated: false });
    }
  } catch (error) {
    console.error("Error verifying JWT:", error);
    res.json({ isAuthenticated: false });
  }
};

export const logout = (req: Request, res: Response) => {
  console.log("logout");
  res.clearCookie("jwt", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.json({ message: "Logged out successfully" });
};
