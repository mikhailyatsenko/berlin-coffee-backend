import jwt from "jsonwebtoken";

const verifyToken = (token: string, userId: string): boolean => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      exp: number;
      id: string;
    };

    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      throw new Error("Token has expired");
    }

    return decoded.id === userId;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Token verification failed:", error.message);
    } else {
      console.error("Token verification failed with an unknown error.");
    }
    return false;
  }
};

export default verifyToken;
