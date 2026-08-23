import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  try {
    // Indexes are managed by the migration scripts, not on boot: mongoose never
    // drops an index whose options changed, so in production autoIndex would
    // silently leave the old definition in place.
    await mongoose.connect(process.env.MONGO_URI!, {
      autoIndex: process.env.NODE_ENV !== "production",
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
