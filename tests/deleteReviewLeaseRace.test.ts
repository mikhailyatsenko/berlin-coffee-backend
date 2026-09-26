/**
 * deleteReview racing an in-flight photo upload, against a throwaway mongod
 * and a fake ImageKit bucket.
 *
 * The invariant under test: once deleteReview has run to completion, no
 * upload whose lease predates it may still land a counted photo. The counter
 * is the only thing the frontend trusts, so it must end at 0, not at
 * whatever the abandoned upload thinks its index was.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import sharp from "sharp";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv({
  REVIEW_IMAGE_UPLOAD_TIMEOUT_MS: "5000",
});

const { default: ImageKit } = await import("imagekit");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { uploadReviewImageResolver } = await import(
  "../src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.js"
);
const { deleteReviewResolver } = await import(
  "../src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.js"
);

// --- fake ImageKit ---------------------------------------------------------

/** Resolves once the caller decides the upload has "landed". */
let releaseUpload: () => void = () => {};
let uploadCalls = 0;

(ImageKit.prototype as any).upload = async function (opts: {
  file: Buffer;
  fileName: string;
  folder: string;
}) {
  uploadCalls++;
  await new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  return { filePath: `/${opts.folder}/${opts.fileName}` };
};

const deleteFolderCalls: string[] = [];

(ImageKit.prototype as any).deleteFolder = async function (folderPath: string) {
  deleteFolderCalls.push(folderPath);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  uploadCalls = 0;
  deleteFolderCalls.length = 0;
  releaseUpload = () => {};
  await Interaction.deleteMany({});
});

// --- helpers -----------------------------------------------------------

const png = (await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#888" },
})
  .png()
  .toBuffer()
  .then((b) => b.toString("base64"))) as string;

async function createReview(reviewImages: number) {
  const userId = new mongoose.Types.ObjectId();
  const placeId = new mongoose.Types.ObjectId();
  const review = await Interaction.create({
    userId,
    placeId,
    reviewText: "nice",
    reviewImages,
  });
  return { reviewId: review.id as string, placeId: placeId.toString(), userId };
}

type Review = Awaited<ReturnType<typeof createReview>>;

// --- test ----------------------------------------------------------------

test("deleteReview run to completion after an upload took its lease fails the upload's commit", async () => {
  const review: Review = await createReview(2);

  // The upload takes the lease for image_3 and starts talking to ImageKit,
  // but does not land until we release it below.
  const uploadPromise = uploadReviewImageResolver(
    undefined as never,
    { reviewId: review.reviewId, fileBuffer: png },
    { user: { id: review.userId.toString() } as any },
  );
  while (uploadCalls < 1) await sleep(5);

  const leased = await Interaction.findById(review.reviewId).lean();
  assert.equal(
    leased?.photoUploadLease?.token !== undefined,
    true,
    "the upload must hold the lease before delete runs",
  );

  // deleteReview now runs to completion: it clears the counter atomically
  // and awaits the ImageKit folder delete, all before it returns.
  const deleteResult = await deleteReviewResolver(
    undefined as never,
    { reviewId: review.reviewId, deleteOptions: "deleteAll" },
    { user: { id: review.userId.toString() } },
  );
  assert.equal((deleteResult as any).reviewId, review.reviewId);

  const afterDelete = await Interaction.findById(review.reviewId).lean();
  assert.equal(afterDelete?.reviewImages, 0);
  assert.deepEqual(deleteFolderCalls, [
    `3welle/review-images/${review.placeId}/${review.reviewId}`,
  ]);

  // Only now does the abandoned upload actually land its file.
  releaseUpload();
  await assert.rejects(
    uploadPromise,
    (error: any) => {
      assert.equal(error.extensions?.code, "INTERNAL_SERVER_ERROR");
      return true;
    },
    "the commit must fail once the counter has moved out from under it",
  );

  const final = await Interaction.findById(review.reviewId).lean();
  assert.equal(final?.reviewImages, 0, "the counter must stay at 0");
  assert.equal(
    final?.photoUploadLease?.token,
    undefined,
    "the failed commit releases the lease, leaving no orphaned hold",
  );
});
