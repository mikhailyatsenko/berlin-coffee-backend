import { Router } from "express";
import * as authController from "../controllers/authController.js";

const router = Router();

router.get("/google", authController.googleAuth);
router.get("/google/callback", authController.googleCallback);

router.get("/check", authController.checkAuth);

router.post("/logout", authController.logout);

export default router;
