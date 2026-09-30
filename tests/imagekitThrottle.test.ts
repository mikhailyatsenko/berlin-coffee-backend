/**
 * ImageKit calls in src/utils/imagekit.ts wait through one shared throttle, so
 * back-to-back calls of different helpers are spaced by the same minimum
 * interval. A sample of the helpers is checked, not every one.
 *
 * The fake ImageKit only records when each SDK method is reached; no mongod.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { setTestEnv } from "./support/mongod.js";

setTestEnv();

const { default: ImageKit } = await import("imagekit");
const {
  deleteImageKitFolder,
  getPlaceImages,
  listReviewPhotoNames,
  reviewPhotoFolder,
  uploadAvatar,
  uploadReviewImage,
} = await import("../src/utils/imagekit.js");

/**
 * MIN_REQUEST_INTERVAL in src/utils/imagekit.ts, copied on purpose: the test
 * pins the interval, so changing it has to change this too.
 */
const MIN_INTERVAL_MS = 50;
/** Node may fire a timer up to 1 ms early as measured by Date.now(). */
const TIMER_SLACK_MS = 1;

// --- fake ImageKit ---------------------------------------------------------

/** When each SDK method was reached, in call order. */
const reached: { method: string; at: number }[] = [];

const fakeImageKit = ImageKit.prototype as unknown as {
  upload: (o: { folder: string; fileName: string }) => Promise<{ filePath: string }>;
  listFiles: (o: { path: string }) => Promise<never[]>;
  deleteFolder: (path: string) => Promise<void>;
};

fakeImageKit.upload = async (opts) => {
  reached.push({ method: "upload", at: Date.now() });
  return { filePath: `/${opts.folder}/${opts.fileName}` };
};
fakeImageKit.listFiles = async () => {
  reached.push({ method: "listFiles", at: Date.now() });
  return [];
};
fakeImageKit.deleteFolder = async () => {
  reached.push({ method: "deleteFolder", at: Date.now() });
};

const photo = await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#888" },
})
  .jpeg()
  .toBuffer();

function assertSpaced() {
  for (let i = 1; i < reached.length; i++) {
    const gap = reached[i].at - reached[i - 1].at;
    assert.ok(
      gap >= MIN_INTERVAL_MS - TIMER_SLACK_MS,
      `${reached[i - 1].method} → ${reached[i].method}: ${gap} ms apart`,
    );
  }
}

beforeEach(() => {
  reached.length = 0;
});

// Uploads go last: an upload reaches the SDK only after the resize, later than
// its throttle slot, so the next call's gap would be measured from too late a
// point and look shorter than the throttle made it.
test("an upload right after a delete waits out the minimum interval", async () => {
  await deleteImageKitFolder(reviewPhotoFolder("p", "r"));
  await uploadAvatar(photo, "u1");
  assert.deepEqual(
    reached.map((r) => r.method),
    ["deleteFolder", "upload"],
  );
  assertSpaced();
});

test("list and upload helpers share the throttle with the delete", async () => {
  const farDeadline = new Date(Date.now() + 10_000);
  await deleteImageKitFolder(reviewPhotoFolder("p", "r"));
  await getPlaceImages("p");
  await listReviewPhotoNames("p", "r");
  await uploadReviewImage(photo, "p", "r", 1, farDeadline);
  assert.deepEqual(
    reached.map((r) => r.method),
    ["deleteFolder", "listFiles", "listFiles", "upload"],
  );
  assertSpaced();
});
