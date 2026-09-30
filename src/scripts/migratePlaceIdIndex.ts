import { config } from "../config/config.js";
import mongoose from "mongoose";
import { ensurePlaceIdIndex } from "./interactionPlaceIdIndex.js";

/**
 * One-off migration: index `interactions.placeId`, which autoIndex doesn't
 * create in production. Without it every lookup of a Place's Reviews scans
 * the whole collection.
 *
 * Run on the server after deploying:  npm run migrate:placeid-index
 *
 * Only creates an index; safe to re-run.
 */

const migrate = async () => {
  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");

  console.log("Ensuring index placeId_1 on interactions");
  await ensurePlaceIdIndex(mongoose.connection);

  console.log("Resulting interaction indexes:");
  console.log(await mongoose.connection.collection("interactions").indexes());

  await mongoose.disconnect();
};

migrate().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
