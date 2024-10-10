import multer from "multer";
import path from "path";
import fs from "fs";

import { fileURLToPath } from "url";
import { dirname } from "path";
import verifyToken from "./verifyToken.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Настройка хранилища multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const decoded = verifyToken(req.cookies.jwt, req.body.userId);
    if (!decoded) {
      return cb(new Error("Invalid or expired token."), "");
    }

    const userId = req.body.userId;
    const dir = path.join(__dirname, "../uploads", `user-${userId}`, "avatar");

    // Создаем директорию, если она не существует
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

// Фильтр для проверки типа и размера файла
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const validTypes = ["image/png", "image/jpeg"];

  if (validTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PNG and JPEG are allowed."));
  }
};

// Экспортируем настроенный multer
const avatarUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 },
});

export { avatarUpload };
