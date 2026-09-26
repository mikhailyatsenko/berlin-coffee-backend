/**
 * Repairing Photo counts corrupted by the pre-fix upload bug, against a
 * throwaway mongod. ImageKit is replaced by a fake folder listing.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: Interaction } = await import("../src/models/Interaction.js");
const { findBrokenPhotoCounts, applyPhotoCountRepairs } = await import(
  "../src/scripts/reviewPhotoCounts.js"
);

useThrowawayMongod();

beforeEach(async () => {
  await Interaction.deleteMany({});
});

const placeId = new mongoose.Types.ObjectId();

async function seedReview(reviewImages?: number) {
  const review = await Interaction.create({
    guestId: new mongoose.Types.ObjectId().toString(),
    placeId,
    rating: 4,
  });
  // Written raw, so a missing field stays missing instead of defaulting to 0.
  if (reviewImages !== undefined) {
    await Interaction.collection.updateOne(
      { _id: review._id },
      { $set: { reviewImages } },
    );
  } else {
    await Interaction.collection.updateOne(
      { _id: review._id },
      { $unset: { reviewImages: "" } },
    );
  }
  return review._id.toString();
}

const photos = (...indexes: number[]) => indexes.map((i) => `image_${i}.jpg`);

/** A fake ImageKit: folder contents keyed by review id. */
function fakeFolders(folders: Record<string, string[]>) {
  const listed: string[] = [];
  const list = async (_placeId: string, reviewId: string) => {
    listed.push(reviewId);
    return folders[reviewId] ?? [];
  };
  return { list, listed };
}

test("a gap in the files cuts the count to the Photos before it", async () => {
  const reviewId = await seedReview(10);
  const { list } = fakeFolders({
    [reviewId]: photos(1, 2, 3, 4, 6, 7, 8, 9, 10),
  });

  const { repairs, failed } = await findBrokenPhotoCounts(list);

  assert.deepEqual(failed, []);
  assert.deepEqual(repairs, [
    { reviewId, placeId: placeId.toString(), stored: 10, repaired: 4 },
  ]);
});

test("a review whose files all exist is left out", async () => {
  const reviewId = await seedReview(3);
  const { list } = fakeFolders({ [reviewId]: photos(1, 2, 3) });

  const { repairs } = await findBrokenPhotoCounts(list);

  assert.deepEqual(repairs, []);
});

test("files past the stored count never raise it", async () => {
  // A late upload that landed after its request was abandoned is never counted.
  const reviewId = await seedReview(2);
  const { list } = fakeFolders({ [reviewId]: photos(1, 2, 3) });

  const { repairs } = await findBrokenPhotoCounts(list);

  assert.deepEqual(repairs, []);
});

test("an empty folder repairs the count to 0", async () => {
  const reviewId = await seedReview(2);
  const { list } = fakeFolders({ [reviewId]: [] });

  const { repairs } = await findBrokenPhotoCounts(list);

  assert.deepEqual(repairs, [
    { reviewId, placeId: placeId.toString(), stored: 2, repaired: 0 },
  ]);
});

test("reviews without Photos are not listed in ImageKit at all", async () => {
  await seedReview(0);
  await seedReview();
  const { list, listed } = fakeFolders({});

  const { repairs } = await findBrokenPhotoCounts(list);

  assert.deepEqual(repairs, []);
  assert.deepEqual(listed, []);
});

test("a failed listing is reported and never taken for an empty folder", async () => {
  const reviewId = await seedReview(3);
  const list = async () => {
    throw new Error("ImageKit is down");
  };

  const { repairs, failed } = await findBrokenPhotoCounts(list);

  assert.deepEqual(repairs, []);
  assert.deepEqual(failed, [{ reviewId, message: "ImageKit is down" }]);
});

test("applying writes the repaired count to the listed reviews only", async () => {
  const broken = await seedReview(10);
  const fine = await seedReview(10);

  const result = await applyPhotoCountRepairs([
    { reviewId: broken, placeId: placeId.toString(), stored: 10, repaired: 4 },
  ]);

  assert.deepEqual(result, { written: [broken], changedMeanwhile: [] });
  assert.equal((await Interaction.findById(broken))!.reviewImages, 4);
  assert.equal((await Interaction.findById(fine))!.reviewImages, 10);
});

test("applying skips a review whose count changed since it was listed", async () => {
  // e.g. deleteReview cleared its Photos between the dry run and the write.
  const reviewId = await seedReview(0);

  const result = await applyPhotoCountRepairs([
    { reviewId, placeId: placeId.toString(), stored: 10, repaired: 4 },
  ]);

  assert.deepEqual(result, { written: [], changedMeanwhile: [reviewId] });
  assert.equal((await Interaction.findById(reviewId))!.reviewImages, 0);
});
