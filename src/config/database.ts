import mongoose from "mongoose";
import { config } from "./config.js";

export const connectDatabase = async (): Promise<void> => {
  try {
    // Indexes are managed by the migration scripts, not on boot: mongoose never
    // drops an index whose options changed, so in production autoIndex would
    // silently leave the old definition in place.
    await mongoose.connect(config.mongoUri, {
      autoIndex: !config.isProduction,
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
