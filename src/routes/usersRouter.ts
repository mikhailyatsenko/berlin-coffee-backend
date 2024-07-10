// routes/users.ts
import { Router } from "express";
import User from "../models/User";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { RequestWithUser } from "types/express";
import mongoose from "mongoose";

const router = Router();

// Добавление кафе в избранное
router.post(
  "/favorites/:cafeId",
  authMiddleware,
  async (req: RequestWithUser, res) => {
    try {
      const { cafeId } = req.params;
      const objectIdCafeId = new mongoose.Types.ObjectId(cafeId);
      const userId = req.user!._id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.favorites.includes(objectIdCafeId)) {
        user.favorites.push(objectIdCafeId);
        await user.save();
      }

      res.json(user.favorites);
    } catch (error) {
      res.status(400).json({ message: "Error adding to favorites", error });
    }
  },
);

// Удаление кафе из избранного
router.delete(
  "/favorites/:cafeId",
  authMiddleware,
  async (req: RequestWithUser, res) => {
    try {
      const { cafeId } = req.params;
      const userId = req.user!._id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.favorites = user.favorites.filter((id) => id.toString() !== cafeId);
      await user.save();

      res.json(user.favorites);
    } catch (error) {
      res.status(400).json({ message: "Error removing from favorites", error });
    }
  },
);

// Получение избранных кафе пользователя
router.get("/favorites", authMiddleware, async (req: RequestWithUser, res) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId).populate("favorites");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user.favorites);
  } catch (error) {
    res.status(400).json({ message: "Error fetching favorites", error });
  }
});

export default router;
