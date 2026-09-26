/**
 * Review Photo upload against a throwaway mongod and a fake ImageKit bucket.
 *
 * The invariant under test is the one the frontend relies on: it builds the
 * URLs image_1 .. image_<reviewImages> from the counter alone, so every one of
 * those files must exist, and every upload the server acknowledged must be
 * inside the counter.
 *
 * Run: npm test
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import sharp from "sharp";

const PORT = 27000 + Math.floor(Math.random() * 1000);

// Set before the app modules load: env.ts throws on missing variables and
// dotenv never overrides what is already set, so a real .env cannot leak in.
Object.assign(process.env, {
  MONGO_URI: `mongodb://127.0.0.1:${PORT}/test`,
  GOOGLE_CLIENT_ID: "test",
  GOOGLE_CLIENT_SECRET: "test",
  JWT_SECRET: "test",
  MAILERSEND_API_KEY: "test",
  NODE_ENV: "test",
  IMAGEKIT_PUBLIC_KEY: "test",
  IMAGEKIT_PRIVATE_KEY: "test",
  IMAGEKIT_URL_ENDPOINT: "https://ik.invalid/test",
  RECAPTCHA_V3_SECRET: "test",
  REVIEW_IMAGE_UPLOAD_TIMEOUT_MS: "300",
});

const { default: ImageKit } = await import("imagekit");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { uploadReviewImageResolver } = await import(
  "../src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.js"
);

// --- fake ImageKit ---------------------------------------------------------

interface UploadCall {
  fileName: string;
  folder: string;
}

const bucket = new Map<string, Buffer>();
let calls = 0;
/** Decides what one upload does; resolve = stored, reject = failed, never settle = hang. */
let behavior: (call: UploadCall, n: number) => Promise<void> = async () => {};

(ImageKit.prototype as any).upload = async function (opts: {
  file: Buffer;
  fileName: string;
  folder: string;
}) {
  const n = ++calls;
  await behavior({ fileName: opts.fileName, folder: opts.folder }, n);
  const filePath = `/${opts.folder}/${opts.fileName}`;
  bucket.set(filePath, opts.file);
  return { filePath };
};

const hang = () => new Promise<void>(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fails = async (ms = 0) => {
  await sleep(ms);
  throw new Error("ImageKit 500");
};

// --- mongod ----------------------------------------------------------------

let mongod: ChildProcess;
let dbPath: string;

before(async () => {
  dbPath = mkdtempSync(path.join(tmpdir(), "review-photo-mongo-"));
  mongod = spawn(
    "mongod",
    ["--dbpath", dbPath, "--port", String(PORT), "--bind_ip", "127.0.0.1"],
    { stdio: "ignore" },
  );
  for (let attempt = 0; ; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI!, {
        serverSelectionTimeoutMS: 500,
      });
      break;
    } catch (error) {
      if (attempt > 40) throw error;
      await sleep(250);
    }
  }
});

after(async () => {
  await mongoose.disconnect();
  mongod.kill("SIGKILL");
  rmSync(dbPath, { recursive: true, force: true });
});

beforeEach(async () => {
  bucket.clear();
  calls = 0;
  behavior = async () => {};
  await Interaction.deleteMany({});
});

// --- helpers ---------------------------------------------------------------

const png = (await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#888" },
})
  .png()
  .toBuffer()
  .then((b) => b.toString("base64"))) as string;

async function createReview(reviewImages = 0) {
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

/** Puts image_1 .. image_n in the bucket, as n earlier successful uploads would have. */
function seedFiles(review: Review, n: number) {
  for (let i = 1; i <= n; i++)
    bucket.set(filePathOf(review, i), Buffer.from("x"));
}

const filePathOf = (r: Review, i: number) =>
  `/3welle/review-images/${r.placeId}/${r.reviewId}/image_${i}.jpg`;

const upload = (r: Review) =>
  uploadReviewImageResolver(
    undefined as never,
    { reviewId: r.reviewId, fileBuffer: png },
    { user: { id: r.userId.toString() } as any },
  );

type Settled =
  | { status: "ok"; reviewImages: number }
  | { status: "error"; message: string }
  | { status: "hung" };

/** Waits for a call, but never longer than `ms`: a hung call is a result, not a stuck test. */
async function settle(
  p: Promise<{ reviewImages: number }>,
  ms = 2000,
): Promise<Settled> {
  return await Promise.race([
    p.then(
      (v): Settled => ({ status: "ok", reviewImages: v.reviewImages }),
      (e): Settled => ({ status: "error", message: String(e.message ?? e) }),
    ),
    sleep(ms).then((): Settled => ({ status: "hung" })),
  ]);
}

/** What the frontend would render: image_1 .. image_<reviewImages>. */
async function assertCounterMatchesFiles(r: Review, results: Settled[] = []) {
  const doc = await Interaction.findById(r.reviewId).lean();
  const count = doc?.reviewImages ?? 0;
  const missing: string[] = [];
  for (let i = 1; i <= count; i++) {
    if (!bucket.has(filePathOf(r, i))) missing.push(`image_${i}.jpg`);
  }
  assert.deepEqual(
    missing,
    [],
    `reviewImages=${count}, but these files do not exist: ${missing.join(", ")}`,
  );

  for (const res of results) {
    if (res.status !== "ok") continue;
    assert.ok(
      res.reviewImages <= count,
      `upload acknowledged as image_${res.reviewImages}, but the card shows only ${count} photos`,
    );
    assert.ok(bucket.has(filePathOf(r, res.reviewImages)));
  }
}

// --- tests -----------------------------------------------------------------

test("an ImageKit call that never answers ends with an error, not a hang", async () => {
  const review = await createReview();
  behavior = hang;

  const result = await settle(upload(review));

  assert.equal(
    result.status,
    "error",
    "the upload must fail once ImageKit stalls",
  );
  await assertCounterMatchesFiles(review);
  const doc = await Interaction.findById(review.reviewId).lean();
  assert.equal(
    doc?.reviewImages,
    0,
    "a stalled upload must not count as a photo",
  );
});

test("2026-09-26: image_5 stalls, later uploads must not leave the counter past a missing file", async () => {
  const review = await createReview(4);
  seedFiles(review, 4);

  // The fifth call never answers; the client moves on to the rest.
  behavior = async (_call, n) => (n === 1 ? hang() : undefined);
  const stalled = settle(upload(review), 4000);
  // Only go on once it holds the lease, or a later call could win the race for it.
  while (calls < 1) await sleep(5);

  const results: Settled[] = [];
  for (let i = 0; i < 5; i++) results.push(await settle(upload(review)));

  await assertCounterMatchesFiles(review, results);

  // Once the stall is over, the fifth photo can still be uploaded and takes its own slot.
  assert.equal(
    (await stalled).status,
    "error",
    "the stalled call must end with an error",
  );
  const retry = await settle(upload(review));
  assert.deepEqual(retry, { status: "ok", reviewImages: 5 });
  await assertCounterMatchesFiles(review, [retry]);
});

test("a failed upload after a later one succeeded must not drop the later photo", async () => {
  const review = await createReview(4);
  seedFiles(review, 4);

  // First call fails slowly, the second (concurrent) one succeeds at once.
  behavior = async (_call, n) => (n === 1 ? fails(200) : undefined);
  const first = settle(upload(review));
  while (calls < 1) await sleep(5);
  const second = settle(upload(review));
  const results = [await first, await second];

  await assertCounterMatchesFiles(review, results);
});

test("sequential uploads fill image_1 .. image_10 and stop at the limit", async () => {
  const review = await createReview();

  const results: Settled[] = [];
  for (let i = 0; i < 10; i++) results.push(await settle(upload(review)));
  assert.deepEqual(
    results.map((r) => (r.status === "ok" ? r.reviewImages : r.status)),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );

  const eleventh = await settle(upload(review));
  assert.equal(eleventh.status, "error");
  await assertCounterMatchesFiles(review, results);
});

test("a failed upload leaves the counter alone and the next one reuses the slot", async () => {
  const review = await createReview(2);
  seedFiles(review, 2);

  behavior = async (_call, n) => (n === 1 ? fails() : undefined);
  const failed = await settle(upload(review));
  assert.equal(failed.status, "error");

  const next = await settle(upload(review));
  assert.deepEqual(next, { status: "ok", reviewImages: 3 });
  await assertCounterMatchesFiles(review, [failed, next]);
});

test("a lease left by a crashed upload blocks only until it expires", async () => {
  const review = await createReview(2);
  seedFiles(review, 2);

  const lease = (until: Date) =>
    Interaction.updateOne(
      { _id: review.reviewId },
      { $set: { photoUploadLease: { token: "crashed", until } } },
    );

  await lease(new Date(Date.now() + 60_000));
  const blocked = await settle(upload(review));
  assert.equal(blocked.status, "error");

  await lease(new Date(Date.now() - 1));
  const taken = await settle(upload(review));
  assert.deepEqual(taken, { status: "ok", reviewImages: 3 });
  await assertCounterMatchesFiles(review, [blocked, taken]);
});

test("photos deleted while an upload is in flight are not brought back by its counter", async () => {
  const review = await createReview(3);
  seedFiles(review, 3);

  // deleteReview zeroes the counter and drops the folder while image_4 uploads.
  behavior = async () => {
    await sleep(100);
    await Interaction.updateOne({ _id: review.reviewId }, { reviewImages: 0 });
    bucket.clear();
  };
  const result = await settle(upload(review));

  assert.equal(result.status, "error");
  const doc = await Interaction.findById(review.reviewId).lean();
  assert.equal(doc?.reviewImages, 0);
  assert.equal(
    doc?.photoUploadLease?.token,
    undefined,
    "the lease is released",
  );
});
