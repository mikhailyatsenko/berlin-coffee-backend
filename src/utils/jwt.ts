import jwt from "jsonwebtoken";

export const createJWT = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "2d" });
};
