/**
 * Every ImageKit call in src/utils/imagekit.ts waits through one throttle, so
 * calls of different helpers are spaced by the same minimum interval.
 *
 * The fake ImageKit only records when each SDK method is reached; no mongod.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { setTestEnv } from "./support/mongod.js";

setTestEnv();

const { default: ImageKit } = await import("imagekit");
const {
  deleteImageKitFolder,
  getPlaceImages,
  listReviewPhotoNames,
  uploadAvatar,
  uploadReviewImage,
} = await import("../src/utils/imagekit.js");

/** MIN_REQUEST_INTERVAL in src/utils/imagekit.ts. */
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

// The upload goes second: its SDK call comes after the resize, so an upload's
// timestamp is later than its throttle slot and would widen the next gap.

test("an upload right after a delete waits out the minimum interval", async () => {
  reached.length = 0;
  await deleteImageKitFolder("3welle/review-images/p/r");
  await uploadAvatar(photo, "u1");
  assert.deepEqual(
    reached.map((r) => r.method),
    ["deleteFolder", "upload"],
  );
  assertSpaced();
});

test("list and upload helpers share the throttle with the delete", async () => {
  reached.length = 0;
  await deleteImageKitFolder("3welle/review-images/p/r");
  await getPlaceImages("p");
  await listReviewPhotoNames("p", "r");
  await uploadReviewImage(photo, "p", "r", 1, new Date(Date.now() + 10_000));
  assert.deepEqual(
    reached.map((r) => r.method),
    ["deleteFolder", "listFiles", "listFiles", "upload"],
  );
  assertSpaced();
});
