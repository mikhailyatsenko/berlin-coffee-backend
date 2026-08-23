import "../config/env.js";
import mongoose from "mongoose";

/**
 * One-off migration: allow guest (unauthenticated) interactions.
 *
 * Replaces the plain unique index { userId, placeId } with two partial unique
 * indexes so that documents without a userId (guest reviews) no longer collide
 * with each other on `null`.
 *
 * Run manually on the server BEFORE deploying the code that writes guest
 * interactions:  node dist/scripts/migrateGuestIndexes.js
 *
 * Safe to re-run: every step checks the current state first.
 */

const OLD_INDEX_NAME = "userId_1_placeId_1";
const GUEST_INDEX_NAME = "guestId_1_placeId_1";

const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log("Connected to MongoDB");

  const collection = mongoose.connection.collection("interactions");
  const indexes = await collection.indexes();

  const existing = indexes.find((index) => index.name === OLD_INDEX_NAME);

  // The old index has the same key pattern as the new one, so Mongo would
  // reject the new definition with IndexOptionsConflict. Drop it first.
  if (existing && !existing.partialFilterExpression) {
    console.log(`Dropping legacy index ${OLD_INDEX_NAME}`);
    await collection.dropIndex(OLD_INDEX_NAME);
  } else if (existing) {
    console.log(`Index ${OLD_INDEX_NAME} is already partial, leaving it alone`);
  } else {
    console.log(`Index ${OLD_INDEX_NAME} not found, nothing to drop`);
  }

  if (!existing?.partialFilterExpression) {
    console.log(`Creating partial unique index ${OLD_INDEX_NAME}`);
    await collection.createIndex(
      { userId: 1, placeId: 1 },
      {
        name: OLD_INDEX_NAME,
        unique: true,
        partialFilterExpression: { userId: { $exists: true } },
        background: true,
      },
    );
  }

  if (!indexes.some((index) => index.name === GUEST_INDEX_NAME)) {
    console.log(`Creating partial unique index ${GUEST_INDEX_NAME}`);
    await collection.createIndex(
      { guestId: 1, placeId: 1 },
      {
        name: GUEST_INDEX_NAME,
        unique: true,
        partialFilterExpression: { guestId: { $exists: true } },
        background: true,
      },
    );
  } else {
    console.log(`Index ${GUEST_INDEX_NAME} already exists`);
  }

  // autoIndex is off in production, so the unique index the GuestIdentity
  // schema declares has to be created here too. createIndex creates the
  // collection if it does not exist yet, and is a no-op if the index matches —
  // unlike indexes(), which throws NamespaceNotFound on a missing collection.
  const guestIdentities = mongoose.connection.collection("guestidentities");

  console.log("Ensuring unique index guestId_1 on guestidentities");
  await guestIdentities.createIndex(
    { guestId: 1 },
    { name: "guestId_1", unique: true, background: true },
  );

  console.log("Resulting interaction indexes:");
  console.log(await collection.indexes());
  console.log("Resulting guest identity indexes:");
  console.log(await guestIdentities.indexes());

  await mongoose.disconnect();
};

migrate().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
