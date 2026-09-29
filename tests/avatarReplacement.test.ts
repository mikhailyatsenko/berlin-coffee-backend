/**
 * Replacing and deleting an avatar against a throwaway mongod and a fake
 * ImageKit bucket, as in tests/placeSuggestionPhotos.test.ts.
 *
 * The URL must change on every upload (the CDN caches by URL), and the old
 * file must be deleted by its ImageKit path, never by the full URL.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { callResolver } from "./support/callResolver.js";

setTestEnv();

const { default: ImageKit } = await import("imagekit");
const { default: User } = await import("../src/models/User.js");
const { avatarFilePath, deleteAvatar } = await import(
  "../src/utils/imagekit.js"
);
const { uploadAvatarResolver } = await import(
  "../src/graphql/resolvers/uploadAvatarResolver/uploadAvatarResolver.js"
);
const { deleteAvatarResolver } = await import(
  "../src/graphql/resolvers/deleteAvatarResolver/deleteAvatarResolver.js"
);

const ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT!;
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/some-google-avatar";

// --- fake ImageKit bucket ---------------------------------------------------

const bucket = new Map<string, Buffer>();
/** fileIds passed to deleteFile, in order. */
const deletedIds: string[] = [];
let listFails = false;
let deleteFails = false;

type UploadOpts = { file: Buffer; fileName: string; folder: string };
(
  ImageKit.prototype as unknown as {
    upload: (o: UploadOpts) => Promise<{ filePath: string }>;
  }
).upload = async (opts) => {
  const filePath = `/${opts.folder}/${opts.fileName}`;
  bucket.set(filePath, opts.file);
  return { filePath };
};

// The fake bucket's keys already are the file paths, so fileId is the path.
(
  ImageKit.prototype as unknown as {
    listFiles: (o: {
      path: string;
    }) => Promise<{ type: "file"; filePath: string; fileId: string }[]>;
  }
).listFiles = async ({ path }) => {
  if (listFails) throw new Error("ImageKit 500");
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return [...bucket.keys()]
    .filter((key) => key.startsWith(`${prefix}/`))
    .map((key) => ({ type: "file" as const, filePath: key, fileId: key }));
};

(
  ImageKit.prototype as unknown as {
    deleteFile: (fileId: string) => Promise<void>;
  }
).deleteFile = async (fileId) => {
  if (deleteFails) throw new Error("ImageKit 500");
  deletedIds.push(fileId);
  bucket.delete(fileId);
};

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  bucket.clear();
  deletedIds.length = 0;
  listFails = false;
  deleteFails = false;
  await User.deleteMany({});
});

// --- helpers -----------------------------------------------------------

const png = (await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#888" },
})
  .png()
  .toBuffer()
  .then((b) => b.toString("base64")));

const aUser = (avatar?: string) =>
  User.create({
    email: `u${Math.random()}@example.com`,
    displayName: "Anna",
    avatar,
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function upload(user: InstanceType<typeof User>) {
  const result = await callResolver(
    uploadAvatarResolver,
    { userId: user.id, fileBuffer: png, fileName: "me.png" },
    { user },
  );
  // Timestamped file names: keep two uploads in one test in different ms.
  await sleep(2);
  return result;
}

const storedAvatar = async (id: string) => (await User.findById(id))?.avatar;

// --- avatarFilePath ----------------------------------------------------

test("an ImageKit avatar URL maps to its file path; a Google URL to null", () => {
  assert.equal(
    avatarFilePath(`${ENDPOINT}/3welle/avatars/u1/avatar-u1-1.jpeg`),
    "/3welle/avatars/u1/avatar-u1-1.jpeg",
  );
  assert.equal(avatarFilePath(GOOGLE_AVATAR), null);
});

test("uploading over an avatar stored by the old code deletes that file", async () => {
  const legacyPath = "/3welle/avatars/u1/avatar-u1.jpeg";
  bucket.set(legacyPath, Buffer.from("x"));
  const user = await aUser(`${ENDPOINT}${legacyPath}`);

  await upload(user);

  assert.deepEqual(deletedIds, [legacyPath]);
});

// --- uploadAvatar ------------------------------------------------------

test("uploading a second avatar deletes the first file by its path and stores a different URL", async () => {
  const user = await aUser();

  const first = await upload(user);
  const firstUrl = await storedAvatar(user.id);
  assert.equal(firstUrl, first.avatarUrl);
  const firstPath = avatarFilePath(firstUrl!);
  assert.ok(firstPath && bucket.has(firstPath));

  const second = await upload(user);
  const secondUrl = await storedAvatar(user.id);

  assert.equal(secondUrl, second.avatarUrl);
  assert.notEqual(secondUrl, firstUrl);
  assert.deepEqual(deletedIds, [firstPath]);
  assert.deepEqual([...bucket.keys()], [avatarFilePath(secondUrl!)]);
});

test("replacing a Google avatar URL doesn't call ImageKit delete", async () => {
  const user = await aUser(GOOGLE_AVATAR);

  const result = await upload(user);

  assert.deepEqual(deletedIds, []);
  assert.equal(await storedAvatar(user.id), result.avatarUrl);
  assert.ok(result.avatarUrl?.startsWith(`${ENDPOINT}/`));
});

test("a failing delete of the old file still leaves the new avatar saved", async () => {
  const user = await aUser();
  await upload(user);
  const firstUrl = await storedAvatar(user.id);

  deleteFails = true;
  const result = await upload(user);

  assert.equal(result.success, true);
  const saved = await storedAvatar(user.id);
  assert.equal(saved, result.avatarUrl);
  assert.notEqual(saved, firstUrl);
  assert.ok(bucket.has(avatarFilePath(saved!)!));
  // The old file is only left over, not lost track of by a half-done save.
  assert.ok(bucket.has(avatarFilePath(firstUrl!)!));
});

// --- deleteAvatar ------------------------------------------------------

test("deleteAvatar treats a missing file as success", async () => {
  await deleteAvatar("/3welle/avatars/u1/avatar-u1-1.jpeg");
  assert.deepEqual(deletedIds, []);
});

test("deleteAvatar throws when ImageKit fails to delete the file", async () => {
  const path = "/3welle/avatars/u1/avatar-u1-1.jpeg";
  bucket.set(path, Buffer.from("x"));
  deleteFails = true;
  await assert.rejects(deleteAvatar(path));
});

test("deleteAvatar throws when ImageKit fails to list the folder", async () => {
  listFails = true;
  await assert.rejects(deleteAvatar("/3welle/avatars/u1/avatar-u1-1.jpeg"));
});

// --- deleteAvatar resolver ---------------------------------------------

test("the deleteAvatar mutation removes the file and clears the User's avatar", async () => {
  const user = await aUser();
  await upload(user);
  const path = avatarFilePath((await storedAvatar(user.id))!);

  const result = await callResolver(deleteAvatarResolver, {}, { user });

  assert.equal(result.success, true);
  assert.deepEqual(deletedIds, [path]);
  assert.equal(await storedAvatar(user.id), null);
});

test("the deleteAvatar mutation clears a Google avatar without calling ImageKit", async () => {
  const user = await aUser(GOOGLE_AVATAR);

  await callResolver(deleteAvatarResolver, {}, { user });

  assert.deepEqual(deletedIds, []);
  assert.equal(await storedAvatar(user.id), null);
});

test("the deleteAvatar mutation still clears the avatar when ImageKit fails", async () => {
  const user = await aUser();
  await upload(user);
  deleteFails = true;

  const result = await callResolver(deleteAvatarResolver, {}, { user });

  assert.equal(result.success, true);
  assert.equal(await storedAvatar(user.id), null);
});
