import jwt from "jsonwebtoken";

const verifyToken = (token: string, userId: string): boolean => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      exp: number;
      id: string;
    };

    // Проверка времени истечения
    const currentTime = Math.floor(Date.now() / 1000); // Время в секундах
    if (decoded.exp < currentTime) {
      throw new Error("Token has expired");
    }

    return decoded.id === userId; // Возвращаем декодированные данные, если токен действителен
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Token verification failed:", error.message);
    } else {
      console.error("Token verification failed with an unknown error.");
    }
    return false; // Возвращаем null, если проверка не удалась
  }
};

export default verifyToken;
