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
import type { Response } from "express";
import type { IUser } from "../src/models/User.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { clientCode } from "./support/clientCode.js";

setTestEnv({
  REVIEW_IMAGE_UPLOAD_TIMEOUT_MS: "1000",
});

const { default: ImageKit } = await import("imagekit");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { uploadReviewImageResolver } = await import(
  "../src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.js"
);
const { deleteReviewResolver } = await import(
  "../src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.js"
);
import { callResolver } from "./support/callResolver.js";

// --- fake ImageKit ---------------------------------------------------------

/** Resolves once the caller decides the upload has "landed". */
let releaseUpload: () => void = () => {};
/** When false, uploads land at once instead of waiting for releaseUpload. */
let holdUploads = true;
let uploadCalls = 0;

/** The slice of the ImageKit client these tests replace. */
type FakeImageKit = {
  upload: (opts: {
    file: Buffer;
    fileName: string;
    folder: string;
  }) => Promise<{ filePath: string }>;
  deleteFolder: (folderPath: string) => Promise<void>;
};
const fakeImageKit = ImageKit.prototype as unknown as FakeImageKit;

fakeImageKit.upload = async function (opts) {
  uploadCalls++;
  if (holdUploads) {
    await new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
  }
  return { filePath: `/${opts.folder}/${opts.fileName}` };
};

const deleteFolderCalls: string[] = [];
/** Resolves once the caller decides the folder delete is over. */
let releaseFolderDelete: () => void = () => {};
/** When true, folder deletes wait for releaseFolderDelete. */
let holdFolderDeletes = false;

fakeImageKit.deleteFolder = async function (folderPath) {
  deleteFolderCalls.push(folderPath);
  if (holdFolderDeletes) {
    await new Promise<void>((resolve) => {
      releaseFolderDelete = resolve;
    });
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  uploadCalls = 0;
  deleteFolderCalls.length = 0;
  releaseUpload = () => {};
  holdUploads = true;
  releaseFolderDelete = () => {};
  holdFolderDeletes = false;
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

const upload = (r: Review) =>
  callResolver(
    uploadReviewImageResolver,
    { reviewId: r.reviewId, fileBuffer: png },
    { user: { id: r.userId.toString() } as Pick<IUser, "id"> as IUser },
  );

const res = {} as Response;

const deleteReview = (
  r: Review,
  deleteOptions: "deleteReviewText" | "deleteRating" | "deleteAll",
) =>
  callResolver(
    deleteReviewResolver,
    { reviewId: r.reviewId, deleteOptions },
    { user: { id: r.userId.toString() } as Pick<IUser, "id"> as IUser, res },
  );

// --- tests ----------------------------------------------------------------

test("deleteReview run to completion after an upload took its lease fails the upload's commit", async () => {
  const review: Review = await createReview(2);

  // The upload takes the lease for image_3 and starts talking to ImageKit,
  // but does not land until we release it below.
  const uploadPromise = upload(review);
  while (uploadCalls < 1) await sleep(5);

  const leased = await Interaction.findById(review.reviewId).lean();
  assert.equal(
    leased?.photoUploadLease?.token !== undefined,
    true,
    "the upload must hold the lease before delete runs",
  );

  // deleteReview now runs to completion: it clears the counter atomically
  // and awaits the ImageKit folder delete, all before it returns.
  const deleteResult = await deleteReview(review, "deleteAll");
  assert.equal(deleteResult.reviewId, review.reviewId);

  const afterDelete = await Interaction.findById(review.reviewId).lean();
  assert.equal(afterDelete?.reviewImages, 0);
  assert.deepEqual(deleteFolderCalls, [
    `3welle/review-images/${review.placeId}/${review.reviewId}`,
  ]);

  // Only now does the abandoned upload actually land its file.
  releaseUpload();
  await assert.rejects(
    uploadPromise,
    withCode("INTERNAL_SERVER_ERROR"),
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

test("an upload that starts while deleteReview is clearing the folder is refused, not lied to", async () => {
  const review: Review = await createReview(2);
  holdUploads = false;
  holdFolderDeletes = true;

  const deletePromise = deleteReview(review, "deleteAll");
  while (deleteFolderCalls.length < 1) await sleep(5);

  await assert.rejects(upload(review), withCode("UPLOAD_IN_PROGRESS"));
  assert.equal(
    uploadCalls,
    0,
    "nothing may reach ImageKit while the folder is being deleted",
  );

  releaseFolderDelete();
  await deletePromise;

  const final = await Interaction.findById(review.reviewId).lean();
  assert.equal(final?.reviewImages, 0);
});

test("an upload started after deleteReview returns lands as image_1", async () => {
  const review: Review = await createReview(3);
  holdUploads = false;

  await deleteReview(review, "deleteReviewText");

  assert.deepEqual(await upload(review), { reviewImages: 1 });
  const final = await Interaction.findById(review.reviewId).lean();
  assert.equal(final?.reviewImages, 1);
  assert.equal(final?.photoUploadLease?.token, undefined);
});

test("deleteReview does not shorten a timed-out upload's abandoned hold", async () => {
  const review: Review = await createReview(2);
  holdUploads = false;
  // Well past any regular lease: a timed-out upload whose file may still land.
  const holdUntil = new Date(Date.now() + 10 * 60_000);
  await Interaction.updateOne(
    { _id: review.reviewId },
    { $set: { photoUploadLease: { token: "abandoned", until: holdUntil } } },
  );

  await deleteReview(review, "deleteAll");

  const after = await Interaction.findById(review.reviewId).lean();
  assert.equal(after?.reviewImages, 0);
  assert.equal(after?.photoUploadLease?.until?.getTime(), holdUntil.getTime());
  await assert.rejects(upload(review), withCode("UPLOAD_IN_PROGRESS"));
  assert.equal(
    uploadCalls,
    0,
    "no upload may take image_1 while the late file can still land",
  );
});

test("deleteRating leaves an in-flight upload's lease alone and the upload commits", async () => {
  const review: Review = await createReview(2);
  await Interaction.updateOne({ _id: review.reviewId }, { rating: 4 });

  const uploadPromise = upload(review);
  while (uploadCalls < 1) await sleep(5);
  const leased = await Interaction.findById(review.reviewId).lean();

  await deleteReview(review, "deleteRating");

  const afterDelete = await Interaction.findById(review.reviewId).lean();
  assert.deepEqual(afterDelete?.photoUploadLease, leased?.photoUploadLease);
  assert.equal(afterDelete?.rating, undefined);

  releaseUpload();
  assert.deepEqual(await uploadPromise, { reviewImages: 3 });
  assert.deepEqual(deleteFolderCalls, []);
});

test("deleteReviewText and deleteAll on a review with no Photos skip ImageKit and the lease", async () => {
  for (const deleteOptions of ["deleteReviewText", "deleteAll"] as const) {
    const review: Review = await createReview(0);

    await deleteReview(review, deleteOptions);

    const after = await Interaction.findById(review.reviewId).lean();
    assert.equal(after?.reviewText, undefined);
    assert.equal(after?.photoUploadLease, undefined, deleteOptions);
  }
  assert.deepEqual(deleteFolderCalls, []);
});

test("deleteReview hands back an abandoned hold that ends before its own fence", async () => {
  const review: Review = await createReview(2);
  holdUploads = false;
  // Shorter than the fence (upload timeout + margin), but still running.
  const holdUntil = new Date(Date.now() + 3_000);
  await Interaction.updateOne(
    { _id: review.reviewId },
    { $set: { photoUploadLease: { token: "abandoned", until: holdUntil } } },
  );

  await deleteReview(review, "deleteAll");

  const after = await Interaction.findById(review.reviewId).lean();
  assert.equal(after?.reviewImages, 0);
  assert.equal(after?.photoUploadLease?.token, "abandoned");
  assert.equal(after?.photoUploadLease?.until?.getTime(), holdUntil.getTime());
  await assert.rejects(upload(review), withCode("UPLOAD_IN_PROGRESS"));
});

test("an upload fenced by deleteReview still holds its lease once it times out", async () => {
  const review: Review = await createReview(2);

  const uploadPromise = upload(review);
  while (uploadCalls < 1) await sleep(5);
  await deleteReview(review, "deleteAll");

  // The upload never answers: it times out after deleteReview has returned.
  await assert.rejects(uploadPromise);

  const after = await Interaction.findById(review.reviewId).lean();
  assert.ok(
    (after?.photoUploadLease?.until?.getTime() ?? 0) > Date.now() + 60_000,
    "the timed-out upload's file may still land, so its hold must stand",
  );
  releaseUpload();
});

test("an upload that times out while deleteReview's fence is up still gets its hold", async () => {
  const review: Review = await createReview(2);
  holdFolderDeletes = true;

  const uploadPromise = upload(review);
  while (uploadCalls < 1) await sleep(5);
  const deletePromise = deleteReview(review, "deleteAll");
  while (deleteFolderCalls.length < 1) await sleep(5);

  await assert.rejects(uploadPromise);
  releaseFolderDelete();
  await deletePromise;

  const after = await Interaction.findById(review.reviewId).lean();
  assert.equal(after?.reviewImages, 0);
  assert.ok(
    (after?.photoUploadLease?.until?.getTime() ?? 0) > Date.now() + 60_000,
    "the timed-out upload's file may still land, so its hold must stand",
  );
  releaseUpload();
});
