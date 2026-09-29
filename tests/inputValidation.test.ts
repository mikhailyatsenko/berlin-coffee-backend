/**
 * Mutations refuse input they must not store: a Rating outside 1–5 or not
 * whole, a Review for a Place that doesn't exist, over-long Review text or
 * name, and a password bcrypt would truncate. Against a throwaway mongod and a
 * fake reCAPTCHA.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: User } = await import("../src/models/User.js");
const { default: Place } = await import("../src/models/Place.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { addRatingResolver } = await import(
  "../src/graphql/resolvers/addRatingResolver/addRatingResolver.js"
);
const { addTextReviewResolver } = await import(
  "../src/graphql/resolvers/addTextReviewResolver/addTextReviewResolver.js"
);
const { registerUserResolver } = await import(
  "../src/graphql/resolvers/registerUser/registerUserResolver.js"
);
const { updatePersonalDataResolver } = await import(
  "../src/graphql/resolvers/updatePersonalDataResolver/updatePersonalDataResolver.js"
);
const { setNewPasswordResolver } = await import(
  "../src/graphql/resolvers/setNewPasswordResolver/setNewPasswordResolver.js"
);
const { resetPasswordResolver } = await import(
  "../src/graphql/resolvers/passwordReset/resetPasswordResolver.js"
);
const { signInWithEmailResolver } = await import(
  "../src/graphql/resolvers/signInWithEmailResolver/signInWithEmailResolver.js"
);
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

// --- fake reCAPTCHA: every token passes for registration ---------------------

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, action: "register_user", score: 0.9 }),
  })) as unknown as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

// --- helpers -----------------------------------------------------------------

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

const PASSWORD = "correct-horse";
/** 36 two-byte characters: 36 characters, 72 bytes. */
const PASSWORD_72_BYTES = "ж".repeat(36);
/** 37 two-byte characters: well under 72 characters, but 74 bytes. */
const PASSWORD_74_BYTES = "ж".repeat(37);

const createUser = async () =>
  User.create({
    email: "anna@x.de",
    displayName: "Anna",
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
  });

const createPlace = async () =>
  Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name: "Bonanza", address: "Oderberger Str. 35" },
  });

const register = (fields: { displayName?: string; password?: string }) =>
  callResolver(
    registerUserResolver,
    {
      email: "anna@x.de",
      displayName: "Anna",
      password: PASSWORD,
      captchaToken: "ok",
      ...fields,
    },
    { req: { ip: "127.0.0.1" } as never },
  );

useThrowawayMongod();

beforeEach(async () => {
  await User.deleteMany({});
  await Place.deleteMany({});
  await Interaction.deleteMany({});
});

// --- Rating ------------------------------------------------------------------

for (const rating of [4.5, 0, 6]) {
  test(`addRating ${rating} as a first Rating: BAD_USER_INPUT, nothing stored`, async () => {
    const user = await createUser();
    const place = await createPlace();

    await assert.rejects(
      callResolver(addRatingResolver, { placeId: place.id, rating }, { user }),
      withCode("BAD_USER_INPUT"),
    );
    assert.equal(await Interaction.countDocuments(), 0);
  });

  test(`addRating ${rating} over an existing Rating: BAD_USER_INPUT, Rating unchanged`, async () => {
    const user = await createUser();
    const place = await createPlace();
    await callResolver(addRatingResolver, { placeId: place.id, rating: 4 }, { user });

    await assert.rejects(
      callResolver(addRatingResolver, { placeId: place.id, rating }, { user }),
      withCode("BAD_USER_INPUT"),
    );
    const stored = await Interaction.findOne({}).lean();
    assert.equal(stored?.rating, 4);
  });
}

test("addRating 1 and 5 are accepted", async () => {
  const user = await createUser();
  const place = await createPlace();

  await callResolver(addRatingResolver, { placeId: place.id, rating: 1 }, { user });
  const result = await callResolver(
    addRatingResolver,
    { placeId: place.id, rating: 5 },
    { user },
  );
  assert.equal(result?.userRating, 5);
  assert.equal((await Interaction.findOne({}).lean())?.rating, 5);
});

// --- Place id ----------------------------------------------------------------

const placeIdCases = [
  {
    name: "addRating",
    call: (placeId: string, user: object) =>
      callResolver(addRatingResolver, { placeId, rating: 4 }, { user }),
  },
  {
    name: "addTextReview",
    call: (placeId: string, user: object) =>
      callResolver(addTextReviewResolver, { placeId, text: "Great" }, { user }),
  },
];

for (const { name, call } of placeIdCases) {
  test(`${name} with a malformed placeId: BAD_USER_INPUT, no Review stored`, async () => {
    const user = await createUser();
    await assert.rejects(call("not-an-id", user), withCode("BAD_USER_INPUT"));
    assert.equal(await Interaction.countDocuments(), 0);
  });

  test(`${name} with an unknown placeId: NOT_FOUND, no Review stored`, async () => {
    const user = await createUser();
    const unknownId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(call(unknownId, user), withCode("NOT_FOUND"));
    assert.equal(await Interaction.countDocuments(), 0);
  });
}

// --- Review text -------------------------------------------------------------

test("addTextReview over 1000 characters: BAD_USER_INPUT, nothing stored", async () => {
  const user = await createUser();
  const place = await createPlace();

  await assert.rejects(
    callResolver(
      addTextReviewResolver,
      { placeId: place.id, text: "a".repeat(1001) },
      { user },
    ),
    withCode("BAD_USER_INPUT"),
  );
  assert.equal(await Interaction.countDocuments(), 0);
});

test("addTextReview of 1000 characters plus surrounding spaces is accepted", async () => {
  const user = await createUser();
  const place = await createPlace();

  await callResolver(
    addTextReviewResolver,
    { placeId: place.id, text: `  ${"a".repeat(1000)}\n` },
    { user },
  );
  assert.equal(await Interaction.countDocuments(), 1);
});

// --- Name --------------------------------------------------------------------

for (const displayName of ["", "   ", "a".repeat(51)]) {
  const label = displayName.length > 50 ? "51 characters" : JSON.stringify(displayName);

  test(`register with the name ${label}: BAD_USER_INPUT, no User`, async () => {
    await assert.rejects(register({ displayName }), withCode("BAD_USER_INPUT"));
    assert.equal(await User.countDocuments(), 0);
  });

  test(`updatePersonalData to the name ${label}: BAD_USER_INPUT, name unchanged`, async () => {
    const user = await createUser();
    await assert.rejects(
      callResolver(
        updatePersonalDataResolver,
        { userId: user.id, displayName },
        { user },
      ),
      withCode("BAD_USER_INPUT"),
    );
    assert.equal((await User.findById(user.id).lean())?.displayName, "Anna");
  });
}

test("a name of 50 characters with surrounding spaces is stored trimmed", async () => {
  const name = "a".repeat(50);
  await register({ displayName: ` ${name} ` });
  assert.equal((await User.findOne({}).lean())?.displayName, name);

  const user = await User.findOne({});
  await callResolver(
    updatePersonalDataResolver,
    { userId: user!.id, displayName: " Ada " },
    { user },
  );
  assert.equal((await User.findById(user!.id).lean())?.displayName, "Ada");
});

test("updatePersonalData resending a name from before the limit changes the email", async () => {
  const longName = "a".repeat(60);
  const user = await createUser();
  await User.updateOne({ _id: user._id }, { displayName: longName });
  const current = await User.findById(user.id);

  const result = await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, displayName: longName, email: "ada@x.de" },
    { user: current },
  );
  assert.equal(result?.pendingEmail, "ada@x.de");
  assert.equal((await User.findById(user.id).lean())?.displayName, longName);
});

test("updatePersonalData without a name keeps the name", async () => {
  const user = await createUser();
  await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, displayName: null },
    { user },
  );
  assert.equal((await User.findById(user.id).lean())?.displayName, "Anna");
});

// --- Password ----------------------------------------------------------------

test("register with a password over 72 bytes: BAD_USER_INPUT, no User", async () => {
  await assert.rejects(
    register({ password: PASSWORD_74_BYTES }),
    withCode("BAD_USER_INPUT"),
  );
  assert.equal(await User.countDocuments(), 0);
});

test("register with a password of exactly 72 bytes is accepted", async () => {
  await register({ password: PASSWORD_72_BYTES });
  assert.equal(await User.countDocuments(), 1);
});

test("setNewPassword over 72 bytes: BAD_USER_INPUT, old password still works", async () => {
  const user = await createUser();
  await assert.rejects(
    callResolver(
      setNewPasswordResolver,
      { userId: user.id, oldPassword: PASSWORD, newPassword: PASSWORD_74_BYTES },
      { user },
    ),
    withCode("BAD_USER_INPUT"),
  );
  const stored = await User.findById(user.id).lean();
  assert.ok(await bcrypt.compare(PASSWORD, stored!.password!));
});

test("resetPassword over 72 bytes: BAD_USER_INPUT", async () => {
  await createUser();
  await assert.rejects(
    callResolver(resetPasswordResolver, {
      token: "any",
      email: "anna@x.de",
      newPassword: PASSWORD_74_BYTES,
    }),
    withCode("BAD_USER_INPUT"),
  );
});

test("sign-in does not apply the length rule", async () => {
  await User.create({
    email: "anna@x.de",
    displayName: "Anna",
    password: await bcrypt.hash("short", 4),
    isEmailConfirmed: true,
  });
  const res = { cookie: () => res, setHeader: () => res } as never;
  const result = await callResolver(
    signInWithEmailResolver,
    { email: "anna@x.de", password: "short" },
    { res },
  );
  assert.equal(result?.user.email, "anna@x.de");
});
