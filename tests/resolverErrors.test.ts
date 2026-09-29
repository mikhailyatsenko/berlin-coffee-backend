/**
 * Resolvers follow the error contract: a failure is thrown with the code and
 * message it was authored with, never rewrapped into a vaguer one and never
 * returned as `false` / `success: false`. Against a throwaway mongod.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { GraphQLError } from "graphql";
import type { Response } from "express";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: User } = await import("../src/models/User.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { setNewPasswordResolver } = await import(
  "../src/graphql/resolvers/setNewPasswordResolver/setNewPasswordResolver.js"
);
const { updatePersonalDataResolver } = await import(
  "../src/graphql/resolvers/updatePersonalDataResolver/updatePersonalDataResolver.js"
);
const { placeResolver } = await import(
  "../src/graphql/resolvers/placeResolver/placeResolver.js"
);
const { signInWithEmailResolver } = await import(
  "../src/graphql/resolvers/signInWithEmailResolver/signInWithEmailResolver.js"
);
const { deleteReviewResolver } = await import(
  "../src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.js"
);
const { toggleCharacteristicResolver } = await import(
  "../src/graphql/resolvers/toggleCharacteristicResolver/toggleCharacteristicResolver.js"
);
const { toggleFavoriteResolver } = await import(
  "../src/graphql/resolvers/toggleFavoriteResolver/toggleFavoriteResolver.js"
);
import { callResolver } from "./support/callResolver.js";

/** An assert.rejects validator for a GraphQLError with this code (and message). */
const withCode = (code: string, message?: string) => (error: unknown) => {
  assert.ok(error instanceof GraphQLError, String(error));
  assert.equal(error.extensions.code, code);
  if (message !== undefined) assert.equal(error.message, message);
  return true;
};

const res = {} as Response;

useThrowawayMongod();

beforeEach(async () => {
  await User.deleteMany({});
  await Interaction.deleteMany({});
});

const PASSWORD = "correct-horse";

const createUser = async (email: string) =>
  User.create({
    email,
    displayName: email.split("@")[0],
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
  });

const unknownId = () => new mongoose.Types.ObjectId().toString();

test("setNewPassword with a wrong old password: BAD_USER_INPUT", async () => {
  const user = await createUser("ada@example.com");
  await assert.rejects(
    callResolver(setNewPasswordResolver, { userId: user.id, oldPassword: "wrong", newPassword: "long-enough" },
      { user, res },
    ),
    withCode("BAD_USER_INPUT", "Old password is incorrect"),
  );
});

test("setNewPassword for another user's id: FORBIDDEN", async () => {
  const user = await createUser("ada@example.com");
  await assert.rejects(
    callResolver(setNewPasswordResolver, { userId: unknownId(), oldPassword: PASSWORD, newPassword: "long-enough" },
      { user, res },
    ),
    withCode("FORBIDDEN"),
  );
});

test("setNewPassword anonymous: UNAUTHENTICATED", async () => {
  await assert.rejects(
    callResolver(setNewPasswordResolver, { userId: unknownId(), oldPassword: PASSWORD, newPassword: "long-enough" },
      { res },
    ),
    withCode("UNAUTHENTICATED"),
  );
});

test("updatePersonalData with a taken email: the 'already exists' message", async () => {
  const user = await createUser("ada@example.com");
  await createUser("grace@example.com");
  await assert.rejects(
    callResolver(updatePersonalDataResolver, { userId: user.id, email: "grace@example.com" },
      { user, res },
    ),
    withCode("BAD_USER_INPUT", "User already exists with this email."),
  );
});

test("place with an unknown id: NOT_FOUND", async () => {
  await assert.rejects(
    callResolver(placeResolver, { placeId: unknownId() }, {}),
    withCode("NOT_FOUND"),
  );
});

test("signInWithEmail with a wrong password: BAD_USER_INPUT", async () => {
  await createUser("ada@example.com");
  await assert.rejects(
    callResolver(signInWithEmailResolver, { email: "ada@example.com", password: "wrong" },
      { res },
    ),
    withCode("BAD_USER_INPUT", "Invalid e-mail or password"),
  );
});

test("deleteReview anonymous: UNAUTHENTICATED", async () => {
  await assert.rejects(
    callResolver(deleteReviewResolver, { reviewId: unknownId(), deleteOptions: "deleteAll" },
      { res },
    ),
    withCode("UNAUTHENTICATED"),
  );
});

test("deleteReview on someone else's Review or a missing one: NOT_FOUND", async () => {
  const owner = await createUser("ada@example.com");
  const caller = await createUser("grace@example.com");
  const review = await Interaction.create({
    userId: owner._id,
    placeId: new mongoose.Types.ObjectId(),
    rating: 4,
  });

  for (const reviewId of [review.id, unknownId()]) {
    await assert.rejects(
      callResolver(deleteReviewResolver, { reviewId, deleteOptions: "deleteAll" },
        { user: caller, res },
      ),
      withCode("NOT_FOUND"),
    );
  }
  assert.equal((await Interaction.findById(review._id))?.rating, 4);
});

test("toggleCharacteristic on an unknown Place: thrown NOT_FOUND, not false", async () => {
  const user = await createUser("ada@example.com");
  await assert.rejects(
    callResolver(toggleCharacteristicResolver, { placeId: unknownId(), characteristic: "freeWifi" },
      { user },
    ),
    withCode("NOT_FOUND"),
  );
});

test("toggleFavorite anonymous: UNAUTHENTICATED; on an unknown Place: thrown NOT_FOUND", async () => {
  const user = await createUser("ada@example.com");
  await assert.rejects(
    callResolver(toggleFavoriteResolver, { placeId: unknownId() }, { res }),
    withCode("UNAUTHENTICATED"),
  );
  await assert.rejects(
    callResolver(toggleFavoriteResolver, { placeId: unknownId() },
      { user, res },
    ),
    withCode("NOT_FOUND"),
  );
});

test("toggleFavorite: a database failure is thrown, not returned as false", async () => {
  const user = await createUser("ada@example.com");
  await assert.rejects(
    callResolver(toggleFavoriteResolver, { placeId: "not-an-object-id" },
      { user, res },
    ),
    (error: unknown) => !(error instanceof GraphQLError) || !error.extensions.code,
  );
});
