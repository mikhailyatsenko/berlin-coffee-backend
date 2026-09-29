/**
 * Sessions: a password change or reset revokes them, tokens without the
 * `sessionVersion` claim are refused, cookies are cleared only when a token came
 * in and failed, and the `lastActive` write never fails a request.
 * The context builder runs against a throwaway mongod with a fake request and
 * response that record the cookies set and cleared.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

setTestEnv();

const { default: User } = await import("../src/models/User.js");
const { buildContext } = await import("../src/graphql/buildContext.js");
const { requireUser } = await import("../src/graphql/context.js");
const { setAuthCookies } = await import("../src/utils/authHelpers.js");
const { updateLastActive } = await import("../src/utils/updateLastActive.js");
const { setNewPasswordResolver } = await import(
  "../src/graphql/resolvers/setNewPasswordResolver/setNewPasswordResolver.js"
);
const { resetPasswordResolver } = await import(
  "../src/graphql/resolvers/passwordReset/resetPasswordResolver.js"
);
const { refreshTokenResolver } = await import(
  "../src/graphql/resolvers/refreshTokenResolver/refreshTokenResolver.js"
);

useThrowawayMongod();

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

/** One request through the context builder with these cookies. */
async function request(cookies: Cookies) {
  const { res, set, cleared } = fakeResponse();
  const context = await buildContext({ req: fakeRequest(cookies), res });
  return { context, set, cleared };
}

/** Signs a User in the way the sign-in resolvers do and returns their cookies. */
function signIn(user: InstanceType<typeof User>): Cookies {
  const { res, set } = fakeResponse();
  setAuthCookies(user, res);
  return { ...set };
}

const PASSWORD = "old-password-1";
const RESET_TOKEN = "reset-token";

async function createUser() {
  return User.create({
    email: "session@example.com",
    displayName: "Session",
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
    passwordResetToken: sha256(RESET_TOKEN),
    passwordResetTokenExpires: new Date(Date.now() + 60_000),
  });
}

const sha256 = (token: string) =>
  createHash("sha256").update(token).digest("hex");

beforeEach(async () => {
  await User.deleteMany({});
});

test("a signed-in request resolves its User", async () => {
  const user = await createUser();
  const cookies = signIn(user);

  const { context, cleared } = await request(cookies);

  assert.equal(context.user?.id, user.id);
  assert.deepEqual(cleared, []);
});

test("after setNewPassword the old tokens are rejected and the calling device stays signed in", async () => {
  const user = await createUser();
  const oldCookies = signIn(user);

  const { context } = await request(oldCookies);
  const { res, set: newCookies } = fakeResponse();
  await callResolver(
    setNewPasswordResolver,
    { userId: user.id, oldPassword: PASSWORD, newPassword: "new-password-2" },
    { ...context, res },
  );

  assert.ok(newCookies.jwt && newCookies.refreshToken);

  const oldAccess = await request({ jwt: oldCookies.jwt });
  assert.equal(oldAccess.context.user, null);
  const oldRefresh = await request({ refreshToken: oldCookies.refreshToken });
  assert.equal(oldRefresh.context.user, null);
  const oldBoth = await request(oldCookies);
  assert.equal(oldBoth.context.user, null);
  assert.equal(clientCode(catchError(() => requireUser(oldBoth.context))), "UNAUTHENTICATED");

  const newAccess = await request({ jwt: newCookies.jwt });
  assert.equal(newAccess.context.user?.id, user.id);
  const newRefresh = await request({ refreshToken: newCookies.refreshToken });
  assert.equal(newRefresh.context.user?.id, user.id);
});

test("after resetPassword every old token is rejected and no cookies are issued", async () => {
  const user = await createUser();
  const oldCookies = signIn(user);
  const { res, set } = fakeResponse();

  await callResolver(
    resetPasswordResolver,
    { token: RESET_TOKEN, email: user.email, newPassword: "new-password-2" },
    { res },
  );

  assert.deepEqual(set, {});
  assert.equal((await request({ jwt: oldCookies.jwt })).context.user, null);
  assert.equal(
    (await request({ refreshToken: oldCookies.refreshToken })).context.user,
    null,
  );
});

test("the refreshToken mutation rejects a revoked refresh token", async () => {
  const user = await createUser();
  const oldCookies = signIn(user);
  await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });

  const { res } = fakeResponse();
  const error = await callResolver(
    refreshTokenResolver,
    {},
    { req: fakeRequest(oldCookies), res },
  ).catch((e: unknown) => e);

  assert.equal(clientCode(error), "UNAUTHENTICATED");
});

test("a token without the sessionVersion claim is rejected", async () => {
  const user = await createUser();
  const secret = process.env.JWT_SECRET!;
  const legacyAccess = jwt.sign({ id: user.id, type: "access" }, secret, {
    expiresIn: "15m",
  });
  const legacyRefresh = jwt.sign({ id: user.id, type: "refresh" }, secret, {
    expiresIn: "7d",
  });

  const { context, cleared } = await request({
    jwt: legacyAccess,
    refreshToken: legacyRefresh,
  });

  assert.equal(context.user, null);
  assert.deepEqual(cleared.sort(), ["jwt", "refreshToken"]);
});

test("an access token is not accepted as a refresh token, nor the other way round", async () => {
  const user = await createUser();
  const cookies = signIn(user);

  const swapped = await request({
    jwt: cookies.refreshToken,
    refreshToken: cookies.jwt,
  });

  assert.equal(swapped.context.user, null);
});

test("an anonymous request with no auth cookies gets no Set-Cookie", async () => {
  const { context, set, cleared } = await request({});

  assert.equal(context.user, null);
  assert.deepEqual(set, {});
  assert.deepEqual(cleared, []);
});

test("a request with an invalid token gets its cookies cleared", async () => {
  const { context, cleared } = await request({ jwt: "not-a-jwt" });

  assert.equal(context.user, null);
  assert.deepEqual(cleared.sort(), ["jwt", "refreshToken"]);
});

test("an expired access token with a valid refresh token signs in and issues a new access token", async () => {
  const user = await createUser();
  const { refreshToken } = signIn(user);

  const { context, set, cleared } = await request({ refreshToken });

  assert.equal(context.user?.id, user.id);
  assert.ok(set.jwt);
  assert.deepEqual(cleared, []);
});

test("a failing lastActive write doesn't fail the request", async (t) => {
  const user = await createUser();
  await User.updateOne({ _id: user._id }, { lastActive: new Date(0) });
  const cookies = signIn(user);
  t.mock.method(User, "updateOne", async () => {
    throw new Error("mongo is down");
  });
  t.mock.method(console, "error", () => {});

  const { context } = await request(cookies);

  assert.equal(context.user?.id, user.id);
});

test("a second request within 60 s doesn't write lastActive", async () => {
  const user = await createUser();
  await User.updateOne({ _id: user._id }, { lastActive: new Date(0) });
  const cookies = signIn(user);

  await request(cookies);
  const first = (await User.findById(user._id).lean())!.lastActive!;
  assert.ok(first.getTime() > Date.now() - 10_000);

  await request(cookies);

  const second = (await User.findById(user._id).lean())!.lastActive!;
  assert.equal(second.getTime(), first.getTime());
});

test("a parallel request that saw an old lastActive doesn't overwrite a newer one", async () => {
  const user = await createUser();
  await User.updateOne({ _id: user._id }, { lastActive: new Date(0) });
  const staleCopy = (await User.findById(user._id))!;
  const recent = new Date(Date.now() - 5_000);
  await User.updateOne({ _id: user._id }, { lastActive: recent });

  await updateLastActive(staleCopy);

  const stored = (await User.findById(user._id).lean())!.lastActive!;
  assert.equal(stored.getTime(), recent.getTime());
});

test("a User stored before Sessions had a version signs in and can be revoked", async () => {
  const user = await createUser();
  await User.collection.updateOne(
    { _id: user._id },
    { $unset: { sessionVersion: "" } },
  );
  const legacy = (await User.findById(user._id))!;
  const cookies = signIn(legacy);

  assert.equal((await request(cookies)).context.user?.id, user.id);

  await callResolver(
    resetPasswordResolver,
    { token: RESET_TOKEN, email: user.email, newPassword: "new-password-2" },
    {},
  );
  assert.equal((await request(cookies)).context.user, null);
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}
