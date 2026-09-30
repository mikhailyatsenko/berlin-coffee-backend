/**
 * deleteReview for its two kinds of author, a User and a Guest, and for a
 * Photo folder that ImageKit fails to delete — against a throwaway mongod and
 * a fake ImageKit bucket. The race with a concurrent upload is covered in
 * tests/deleteReviewLeaseRace.test.ts.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { IUser } from "../src/models/User.js";
import type { IGuestIdentity } from "../src/models/GuestIdentity.js";
import type { GuestContext } from "../src/utils/guestAuth.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { clientCode } from "./support/clientCode.js";
import { callResolver, type TestContext } from "./support/callResolver.js";

setTestEnv();

const { default: ImageKit } = await import("imagekit");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { deleteReviewResolver } = await import(
  "../src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.js"
);

// --- fake ImageKit ---------------------------------------------------------

type FakeImageKit = { deleteFolder: (folderPath: string) => Promise<void> };
const fakeImageKit = ImageKit.prototype as unknown as FakeImageKit;

const deleteFolderCalls: string[] = [];
/** When true, ImageKit answers every folder delete with a server error. */
let failFolderDeletes = false;

fakeImageKit.deleteFolder = async function (folderPath) {
  deleteFolderCalls.push(folderPath);
  if (failFolderDeletes) throw { message: "Internal server error" };
};

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  deleteFolderCalls.length = 0;
  failFolderDeletes = false;
  await Interaction.deleteMany({});
});

// --- helpers -----------------------------------------------------------

type Owner = { userId: mongoose.Types.ObjectId } | { guestId: string };

const aUserOwner = () => ({ userId: new mongoose.Types.ObjectId() });
const aGuestOwner = () => ({ guestId: crypto.randomUUID() });

/** The context a request from this author arrives with, identity in headers. */
function contextOf(owner: Owner): TestContext {
  if ("userId" in owner) {
    return { user: { id: owner.userId.toString() } as Pick<IUser, "id"> };
  }
  const identity = { guestId: owner.guestId } as IGuestIdentity;
  return { guest: { status: "valid", identity } };
}

async function aReview(owner: Owner, reviewImages = 2) {
  const placeId = new mongoose.Types.ObjectId();
  const review = await Interaction.create({
    ...owner,
    placeId,
    reviewText: "nice",
    rating: 4,
    reviewImages,
  });
  return { reviewId: review.id as string, placeId: placeId.toString() };
}

const deleteReview = (
  reviewId: string,
  deleteOptions: "deleteReviewText" | "deleteRating" | "deleteAll",
  context: TestContext,
) => callResolver(deleteReviewResolver, { reviewId, deleteOptions }, context);

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

// --- a Guest deletes their own Review ------------------------------------

test("a Guest deletes the text of their own Review, and its Photos with it", async () => {
  const guest = aGuestOwner();
  const { reviewId, placeId } = await aReview(guest);

  await deleteReview(reviewId, "deleteReviewText", contextOf(guest));

  const after = await Interaction.findById(reviewId).lean();
  assert.equal(after?.reviewText, undefined);
  assert.equal(after?.reviewImages, 0);
  assert.equal(after?.rating, 4);
  assert.equal(after?.photoUploadLease, undefined, "the fence is released");
  assert.deepEqual(deleteFolderCalls, [
    `3welle/review-images/${placeId}/${reviewId}`,
  ]);
});

test("a Guest deletes the Rating of their own Review", async () => {
  const guest = aGuestOwner();
  const { reviewId } = await aReview(guest);

  const result = await deleteReview(reviewId, "deleteRating", contextOf(guest));

  assert.equal(result.ratingCount, 0);
  const after = await Interaction.findById(reviewId).lean();
  assert.equal(after?.rating, undefined);
  assert.equal(after?.reviewText, "nice");
  assert.equal(after?.reviewImages, 2);
  assert.deepEqual(deleteFolderCalls, []);
});

test("a Guest deletes all of their own Review; the empty document stays", async () => {
  const guest = aGuestOwner();
  const { reviewId } = await aReview(guest);

  await deleteReview(reviewId, "deleteAll", contextOf(guest));

  const after = await Interaction.findById(reviewId).lean();
  assert.ok(after, "the document stays, as for a User");
  assert.equal(after.reviewText, undefined);
  assert.equal(after.rating, undefined);
  assert.equal(after.reviewImages, 0);
  assert.equal(after.guestId, guest.guestId);
  assert.equal(deleteFolderCalls.length, 1);
});

// --- someone else's Review ---------------------------------------------

test("nobody deletes a Review that isn't theirs: it reads as NOT_FOUND", async () => {
  const cases: [string, Owner, Owner][] = [
    ["a Guest, another Guest's", aGuestOwner(), aGuestOwner()],
    ["a Guest, a User's", aUserOwner(), aGuestOwner()],
    ["a User, a Guest's", aGuestOwner(), aUserOwner()],
    ["a User, another User's", aUserOwner(), aUserOwner()],
  ];

  for (const [name, author, caller] of cases) {
    const { reviewId } = await aReview(author);

    await assert.rejects(
      deleteReview(reviewId, "deleteAll", contextOf(caller)),
      withCode("NOT_FOUND"),
      name,
    );

    const after = await Interaction.findById(reviewId).lean();
    assert.equal(after?.reviewText, "nice", name);
    assert.equal(after?.rating, 4, name);
    assert.equal(after?.reviewImages, 2, name);
  }
  assert.deepEqual(deleteFolderCalls, []);
});

test("a missing Review is NOT_FOUND for a Guest", async () => {
  await assert.rejects(
    deleteReview(
      new mongoose.Types.ObjectId().toString(),
      "deleteAll",
      contextOf(aGuestOwner()),
    ),
    withCode("NOT_FOUND"),
  );
});

// --- no identity, or a broken one --------------------------------------

test("with neither a User nor a Guest identity, deleteReview is UNAUTHENTICATED", async () => {
  const { reviewId } = await aReview(aGuestOwner());

  for (const context of [
    {},
    { guest: { status: "absent" } },
  ] as TestContext[]) {
    await assert.rejects(
      deleteReview(reviewId, "deleteAll", context),
      withCode("UNAUTHENTICATED"),
    );
  }
  const after = await Interaction.findById(reviewId).lean();
  assert.equal(after?.reviewText, "nice");
});

test("with Guest credentials that no longer work, deleteReview is GUEST_IDENTITY_INVALID", async () => {
  const { reviewId } = await aReview(aGuestOwner());
  const guest: GuestContext = { status: "invalid", reason: "unknown_guest" };

  await assert.rejects(
    deleteReview(reviewId, "deleteAll", { guest }),
    withCode("GUEST_IDENTITY_INVALID"),
  );
  const after = await Interaction.findById(reviewId).lean();
  assert.equal(after?.reviewText, "nice");
});

// --- the Photo folder can't be deleted -----------------------------------

test("a failing folder delete leaves the text and the Photos in place, and a retry finishes", async () => {
  for (const owner of [aUserOwner(), aGuestOwner()] as Owner[]) {
    const { reviewId } = await aReview(owner);
    failFolderDeletes = true;

    for (const deleteOptions of ["deleteReviewText", "deleteAll"] as const) {
      await assert.rejects(
        deleteReview(reviewId, deleteOptions, contextOf(owner)),
        withCode("INTERNAL_SERVER_ERROR"),
      );

      const after = await Interaction.findById(reviewId).lean();
      assert.equal(after?.reviewText, "nice", deleteOptions);
      assert.equal(after?.rating, 4, deleteOptions);
      assert.equal(after?.reviewImages, 2, deleteOptions);
      assert.equal(
        after?.photoUploadLease,
        undefined,
        "the fence is released, so uploads aren't held up",
      );
    }

    failFolderDeletes = false;
    await deleteReview(reviewId, "deleteAll", contextOf(owner));

    const after = await Interaction.findById(reviewId).lean();
    assert.equal(after?.reviewText, undefined);
    assert.equal(after?.rating, undefined);
    assert.equal(after?.reviewImages, 0);
  }
});
