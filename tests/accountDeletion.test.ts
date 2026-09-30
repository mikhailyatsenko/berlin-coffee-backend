/**
 * Deleting an account against a throwaway mongod and a fake ImageKit bucket,
 * as in tests/avatarReplacement.test.ts.
 *
 * ImageKit goes first and any failure there leaves the database untouched;
 * the database steps are idempotent and remove the User last, so a retry after
 * a crash finishes the job.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { callResolver } from "./support/callResolver.js";

setTestEnv();

const { default: ImageKit } = await import("imagekit");
const { default: User } = await import("../src/models/User.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { default: GuestIdentity } = await import(
  "../src/models/GuestIdentity.js"
);
const { default: PlaceSuggestion } = await import(
  "../src/models/PlaceSuggestion.js"
);
const { deleteImageKitFolder } = await import("../src/utils/imagekit.js");
const { setAuthCookies } = await import("../src/utils/authHelpers.js");
const { buildContext } = await import("../src/graphql/buildContext.js");
const { deleteAccountResolver } = await import(
  "../src/graphql/resolvers/deleteAccountResolver/deleteAccountResolver.js"
);

const ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT!;

// --- fake ImageKit bucket ---------------------------------------------------

const bucket = new Map<string, Buffer>();
let failImageKit = false;

const withSlash = (path: string) => (path.startsWith("/") ? path : `/${path}`);

/** What the SDK rejects with: a plain object carrying the HTTP status. */
function imagekitError(statusCode: number, message: string) {
  const error = { message };
  Object.defineProperty(error, "$ResponseMetadata", {
    value: { statusCode, headers: {} },
    enumerable: false,
  });
  return error;
}

type FakeImageKit = {
  listFiles: (o: {
    path: string;
  }) => Promise<{ type: "file"; filePath: string; fileId: string }[]>;
  deleteFile: (fileId: string) => Promise<void>;
  deleteFolder: (folderPath: string) => Promise<void>;
};
const fakeImageKit = ImageKit.prototype as unknown as FakeImageKit;

// The fake bucket's keys already are the file paths, so fileId is the path.
fakeImageKit.listFiles = async ({ path }) => {
  if (failImageKit) throw imagekitError(500, "ImageKit 500");
  const prefix = withSlash(path);
  return [...bucket.keys()]
    .filter((key) => key.startsWith(`${prefix}/`))
    .map((key) => ({ type: "file" as const, filePath: key, fileId: key }));
};

fakeImageKit.deleteFile = async (fileId) => {
  if (failImageKit) throw imagekitError(500, "ImageKit 500");
  bucket.delete(fileId);
};

fakeImageKit.deleteFolder = async (folderPath) => {
  if (failImageKit) throw imagekitError(500, "ImageKit 500");
  const prefix = `${withSlash(folderPath)}/`;
  const inFolder = [...bucket.keys()].filter((key) => key.startsWith(prefix));
  if (inFolder.length === 0) {
    throw imagekitError(404, "No folder found with provided path.");
  }
  for (const key of inFolder) bucket.delete(key);
};

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  bucket.clear();
  failImageKit = false;
  await Promise.all([
    User.deleteMany({}),
    Interaction.deleteMany({}),
    GuestIdentity.deleteMany({}),
    PlaceSuggestion.deleteMany({}),
  ]);
});

// --- helpers -----------------------------------------------------------

type Cookies = { jwt?: string; refreshToken?: string };

/** A response that records what the server does to the auth cookies. */
function fakeResponse() {
  const set: Cookies = {};
  const cleared: string[] = [];
  const res = {
    cookie: (name: keyof Cookies, value: string) => {
      set[name] = value;
    },
    clearCookie: (name: string) => {
      cleared.push(name);
    },
  } as unknown as Response;
  return { res, set, cleared };
}

const fakeRequest = (cookies: Cookies) =>
  ({ cookies, headers: {}, get: () => undefined }) as unknown as Request;

const placeId = () => new mongoose.Types.ObjectId();

/**
 * A User with an ImageKit avatar, a Review with Photos, a Favorite, a claimed
 * Guest identity and two Place suggestions; plus someone else's data that must
 * survive.
 */
async function aUserWithData() {
  const user = await User.create({
    email: "anna@example.com",
    displayName: "Anna",
  });
  const avatarPath = `/3welle/avatars/${user.id}/avatar-${user.id}-1.jpeg`;
  bucket.set(avatarPath, Buffer.from("avatar"));
  user.avatar = `${ENDPOINT}${avatarPath}`;
  await user.save();

  const review = await Interaction.create({
    userId: user._id,
    placeId: placeId(),
    rating: 4,
    reviewText: "Good",
    reviewImages: 2,
  });
  const reviewFolder = `/3welle/review-images/${review.placeId}/${review.id}`;
  bucket.set(`${reviewFolder}/image_1.jpg`, Buffer.from("1"));
  bucket.set(`${reviewFolder}/image_2.jpg`, Buffer.from("2"));

  await Interaction.create({
    userId: user._id,
    placeId: placeId(),
    isFavorite: true,
  });

  await GuestIdentity.create({
    guestId: "claimed-guest",
    secretHash: "x",
    claimedBy: user._id,
  });

  await PlaceSuggestion.create([
    { name: "Pending", address: "A 1", userId: user._id },
    {
      name: "Published",
      address: "B 2",
      userId: user._id,
      status: "published",
    },
  ]);

  // Someone else's, untouched by the deletion.
  const other = await User.create({
    email: "ben@example.com",
    displayName: "Ben",
  });
  const otherReview = await Interaction.create({
    userId: other._id,
    placeId: review.placeId,
    rating: 5,
    reviewImages: 1,
  });
  bucket.set(
    `/3welle/review-images/${otherReview.placeId}/${otherReview.id}/image_1.jpg`,
    Buffer.from("o"),
  );
  await GuestIdentity.create({ guestId: "unclaimed-guest", secretHash: "y" });
  await PlaceSuggestion.create({ name: "Ben's", address: "C 3", userId: other._id });

  return { user, other };
}

/** Everything in the database, to compare before and after a failed call. */
async function databaseSnapshot() {
  const [users, interactions, guests, suggestions] = await Promise.all([
    User.find().sort({ _id: 1 }).lean(),
    Interaction.find().sort({ _id: 1 }).lean(),
    GuestIdentity.find().sort({ _id: 1 }).lean(),
    PlaceSuggestion.find().sort({ _id: 1 }).lean(),
  ]);
  return JSON.stringify({ users, interactions, guests, suggestions });
}

async function deleteAccount(user: InstanceType<typeof User>) {
  const { res, cleared } = fakeResponse();
  const result = await callResolver(deleteAccountResolver, {}, { user, res });
  return { result, cleared };
}

async function assertEverythingPersonalGone(
  user: InstanceType<typeof User>,
  other: InstanceType<typeof User>,
) {
  assert.equal(await User.exists({ _id: user._id }), null);
  assert.equal(await Interaction.countDocuments({ userId: user._id }), 0);
  assert.equal(await GuestIdentity.countDocuments({ claimedBy: user._id }), 0);
  assert.equal(await PlaceSuggestion.countDocuments({ userId: user._id }), 0);

  // Only the other User's Photo is left in the bucket.
  const otherReview = await Interaction.findOne({ userId: other._id }).lean();
  assert.deepEqual(
    [...bucket.keys()],
    [
      `/3welle/review-images/${otherReview!.placeId}/${otherReview!._id}/image_1.jpg`,
    ],
  );
  assert.ok(await User.exists({ _id: other._id }));
  assert.ok(await GuestIdentity.exists({ guestId: "unclaimed-guest" }));
  assert.equal(await PlaceSuggestion.countDocuments({ userId: other._id }), 1);
}

// --- full removal ------------------------------------------------------

test("deleting an account removes Interactions, Photos, avatar, claimed Guest identities and the User, and clears the cookies", async () => {
  const { user, other } = await aUserWithData();

  const { result, cleared } = await deleteAccount(user);

  assert.equal(result.success, true);
  assert.deepEqual(cleared.sort(), ["jwt", "refreshToken"]);
  await assertEverythingPersonalGone(user, other);
});

test("the User's Place suggestions stay, with no userId field", async () => {
  const { user } = await aUserWithData();

  await deleteAccount(user);

  const orphans = await PlaceSuggestion.find({
    name: { $in: ["Pending", "Published"] },
  }).lean();
  assert.equal(orphans.length, 2);
  for (const suggestion of orphans) {
    assert.equal("userId" in suggestion, false);
  }
  assert.deepEqual(orphans.map((s) => s.status).sort(), [
    "pending",
    "published",
  ]);
});

test("a Google avatar URL is left alone and doesn't stop the deletion", async () => {
  const user = await User.create({
    email: "g@example.com",
    displayName: "G",
    avatar: "https://lh3.googleusercontent.com/a/some-google-avatar",
  });

  const { result } = await deleteAccount(user);

  assert.equal(result.success, true);
  assert.equal(await User.exists({ _id: user._id }), null);
});

// --- failure and retry -------------------------------------------------

test("a failing ImageKit call fails the deletion and leaves the database untouched", async () => {
  const { user } = await aUserWithData();
  const before = await databaseSnapshot();
  failImageKit = true;

  const { res, cleared } = fakeResponse();
  await assert.rejects(
    callResolver(deleteAccountResolver, {}, { user, res }),
  );

  assert.equal(await databaseSnapshot(), before);
  assert.deepEqual(cleared, []);
});

test("a retry after the User delete failed half-way completes the deletion", async () => {
  const { user, other } = await aUserWithData();

  const originalDeleteOne = User.deleteOne;
  User.deleteOne = (() => {
    User.deleteOne = originalDeleteOne;
    throw new Error("mongod went away");
  }) as unknown as typeof User.deleteOne;
  try {
    await assert.rejects(deleteAccount(user));
  } finally {
    User.deleteOne = originalDeleteOne;
  }
  // Half-way: everything but the User is gone, so the User can still retry.
  assert.ok(await User.exists({ _id: user._id }));
  assert.equal(await Interaction.countDocuments({ userId: user._id }), 0);

  const { result } = await deleteAccount(user);

  assert.equal(result.success, true);
  await assertEverythingPersonalGone(user, other);
});

// --- other devices -----------------------------------------------------

test("another device's token for the deleted User gets no User, without a crash", async () => {
  const { user } = await aUserWithData();
  const { res, set: otherDevice } = fakeResponse();
  setAuthCookies(user, res);

  await deleteAccount(user);

  const context = await buildContext({
    req: fakeRequest({ ...otherDevice }),
    res: fakeResponse().res,
  });
  assert.equal(context.user, null);
});

// --- throwing folder delete -------------------------------------------

test("the folder delete treats a missing folder as success", async () => {
  await deleteImageKitFolder("3welle/review-images/p/nothing-here");
});

test("the folder delete removes the folder's files", async () => {
  bucket.set("/3welle/review-images/p/r/image_1.jpg", Buffer.from("1"));
  await deleteImageKitFolder("3welle/review-images/p/r");
  assert.equal(bucket.size, 0);
});

test("the folder delete throws when ImageKit fails", async () => {
  bucket.set("/3welle/review-images/p/r/image_1.jpg", Buffer.from("1"));
  failImageKit = true;
  await assert.rejects(deleteImageKitFolder("3welle/review-images/p/r"));
});
