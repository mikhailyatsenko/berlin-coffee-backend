/**
 * Google sign-in resolves the User by `googleId`, then by verified email: a
 * confirmed email is linked and keeps its password, an unconfirmed one is taken
 * over by whoever proved the mailbox through Google.
 * Against a throwaway mongod and a fake Google OAuth client.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { Response } from "express";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

setTestEnv();

const { OAuth2Client } = await import("google-auth-library");
const { default: User } = await import("../src/models/User.js");
const { loginWithGoogleResolver } = await import(
  "../src/graphql/resolvers/loginWithGoogleResolver/loginWithGoogleResolver.js"
);
const { signInWithEmailResolver } = await import(
  "../src/graphql/resolvers/signInWithEmailResolver/signInWithEmailResolver.js"
);

useThrowawayMongod();

// --- fake Google: the next sign-in is this Google account --------------------

type GooglePayload = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name: string;
  picture?: string;
};

const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/anna";

let googlePayload: GooglePayload;
OAuth2Client.prototype.getToken = (async () => ({
  tokens: { id_token: "id-token" },
})) as unknown as typeof OAuth2Client.prototype.getToken;
OAuth2Client.prototype.verifyIdToken = (async () => ({
  getPayload: () => googlePayload,
})) as unknown as typeof OAuth2Client.prototype.verifyIdToken;

// --- helpers -----------------------------------------------------------------

const res = {
  cookie: () => res,
  setHeader: () => res,
} as unknown as Response;

const PASSWORD = "correct-horse";

const signInWithGoogle = (payload: Partial<GooglePayload> = {}) => {
  googlePayload = {
    sub: "google-1",
    email: "anna@gmail.com",
    email_verified: true,
    name: "Anna from Google",
    picture: GOOGLE_AVATAR,
    ...payload,
  };
  return callResolver(loginWithGoogleResolver, { code: "code" }, { res });
};

const signInWithPassword = () =>
  callResolver(
    signInWithEmailResolver,
    { email: "anna@gmail.com", password: PASSWORD },
    { res },
  );

const createUser = async (fields: object = {}) =>
  User.create({
    email: "anna@gmail.com",
    displayName: "Anna",
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
    ...fields,
  });

/** The code and message the client gets from a call that must be rejected. */
const clientError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return { code: clientCode(error), message: (error as Error).message };
  }
  assert.fail("expected the call to be rejected");
};

beforeEach(async () => {
  await User.deleteMany({});
});

// --- tests -------------------------------------------------------------------

test("an unverified Google email is refused and no User is written", async () => {
  const error = await clientError(signInWithGoogle({ email_verified: false }));

  assert.deepEqual(error, {
    code: "BAD_USER_INPUT",
    message: "Please verify your email in your Google account first.",
  });
  assert.equal(await User.countDocuments(), 0);
});

test("an unverified Google email is not linked to an existing User", async () => {
  await createUser();
  const before = await User.findOne({}).lean();

  await clientError(signInWithGoogle({ email_verified: undefined }));

  assert.deepEqual(await User.findOne({}).lean(), before);
});

test("a User found by googleId signs in, not a first sign-in", async () => {
  const user = await createUser({ googleId: "google-1", email: "old@x.de" });

  const result = await signInWithGoogle();

  assert.equal(result?.user.id, user.id);
  assert.equal(result?.isFirstLogin, false);
  assert.equal(await User.countDocuments(), 1);
});

test("an email linked to another Google account is refused and nothing changes", async () => {
  await createUser({ googleId: "google-other" });
  const before = await User.findOne({}).lean();

  const error = await clientError(signInWithGoogle());

  assert.deepEqual(error, {
    code: "BAD_USER_INPUT",
    message: "This email is linked to another Google account.",
  });
  assert.deepEqual(await User.findOne({}).lean(), before);
});

test("a confirmed email is linked and its password keeps working", async () => {
  const user = await createUser();

  const result = await signInWithGoogle();

  assert.equal(result?.user.id, user.id);
  assert.equal(result?.isFirstLogin, false);
  const stored = await User.findById(user._id).lean();
  assert.equal(stored?.googleId, "google-1");
  assert.equal(stored?.displayName, "Anna");
  assert.equal(stored?.avatar, GOOGLE_AVATAR);

  const passwordSignIn = await signInWithPassword();
  assert.equal(passwordSignIn?.user.id, user.id);
});

test("linking a confirmed email keeps the User's own avatar", async () => {
  const user = await createUser({ avatar: "https://ik.invalid/own.jpg" });

  await signInWithGoogle();

  const stored = await User.findById(user._id).lean();
  assert.equal(stored?.avatar, "https://ik.invalid/own.jpg");
});

test("an unconfirmed email is taken over: the old password no longer signs in", async () => {
  const user = await createUser({
    isEmailConfirmed: false,
    displayName: "Squatter",
    emailConfirmationToken: "confirm-hash",
    emailConfirmationTokenExpires: new Date(Date.now() + 60_000),
    passwordResetToken: "reset-hash",
    passwordResetTokenExpires: new Date(Date.now() + 60_000),
  });

  const result = await signInWithGoogle();

  assert.equal(result?.user.id, user.id);
  assert.equal(result?.isFirstLogin, true);
  const stored = await User.findById(user._id).lean();
  assert.equal(stored?.googleId, "google-1");
  assert.equal(stored?.isEmailConfirmed, true);
  assert.equal(stored?.password ?? null, null);
  assert.equal(stored?.displayName, "Anna from Google");
  assert.equal(stored?.avatar, GOOGLE_AVATAR);
  assert.equal(stored?.emailConfirmationToken, null);
  assert.equal(stored?.emailConfirmationTokenExpires, null);
  assert.equal(stored?.passwordResetToken, null);
  assert.equal(stored?.passwordResetTokenExpires, null);

  // Before the takeover it was refused as unconfirmed; now it has no password.
  assert.deepEqual(await clientError(signInWithPassword()), {
    code: "BAD_USER_INPUT",
    message:
      "This email is associated with a Google account and does not have a password",
  });
});

test("with no User a new one is created, a first sign-in", async () => {
  const result = await signInWithGoogle();

  assert.equal(result?.isFirstLogin, true);
  const stored = await User.findOne({}).lean();
  assert.equal(stored?.googleId, "google-1");
  assert.equal(stored?.email, "anna@gmail.com");
  assert.equal(stored?.isEmailConfirmed, true);
  assert.equal(stored?.displayName, "Anna from Google");
});

test("a mixed-case Google email matches the stored lowercase User", async () => {
  const user = await createUser();

  const result = await signInWithGoogle({ email: " Anna@Gmail.COM" });

  assert.equal(result?.user.id, user.id);
  assert.equal(await User.countDocuments(), 1);
});

test("a User holding the address only as pendingEmail is not matched", async () => {
  const other = await createUser({
    email: "other@x.de",
    pendingEmail: "anna@gmail.com",
  });

  const result = await signInWithGoogle();

  assert.notEqual(result?.user.id, other.id);
  assert.equal(result?.isFirstLogin, true);
  assert.equal(await User.countDocuments(), 2);
});
