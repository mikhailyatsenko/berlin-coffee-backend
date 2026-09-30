/**
 * An email change stays pending until the link is clicked, and nothing
 * reserves the address meanwhile: it goes to whoever first proves the mailbox.
 * confirmEmail finds the User by token, a change to an address a confirmed
 * User took first ends in EMAIL_TAKEN, and resend mails at most one User.
 * Against a throwaway mongod, a recording mail transport and a fake reCAPTCHA.
 *
 * Google sign-in on an address that is only someone's pendingEmail is covered
 * in googleSignIn.test.ts.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { Response } from "express";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { RecordingTransport } from "./support/mailTransport.js";

setTestEnv();

const { setMailTransport } = await import("../src/mail/transport.js");
const { default: User } = await import("../src/models/User.js");
const { resetRateLimits } = await import("../src/utils/rateLimit.js");
const { confirmEmailResolver } = await import(
  "../src/graphql/resolvers/registerUser/confirmEmailResolver.js"
);
const { resendConfirmationEmailResolver } = await import(
  "../src/graphql/resolvers/registerUser/resendConfirmationEmailResolver.js"
);
const { updatePersonalDataResolver } = await import(
  "../src/graphql/resolvers/updatePersonalDataResolver/updatePersonalDataResolver.js"
);
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

const transport = new RecordingTransport();
setMailTransport(transport);

// --- fake reCAPTCHA: a token passes for the action it names -------------------

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      action: new URLSearchParams(init?.body).get("response"),
      score: 0.9,
    }),
  })) as unknown as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

// --- helpers -----------------------------------------------------------------

const res = {
  cookie: () => res,
  setHeader: () => res,
} as unknown as Response;

let nextIp = 0;
/** A fresh client address, so no test shares a per-IP window with another. */
const anIp = () => ({ ip: `10.0.2.${++nextIp}` }) as never;

const createUser = async (email: string, fields: object = {}) =>
  User.create({
    email,
    displayName: "Anna",
    password: await bcrypt.hash("correct-horse", 4),
    isEmailConfirmed: true,
    ...fields,
  });

/** The token from the confirmation link in the last mail sent. */
const lastToken = () => {
  const match = transport.sent.at(-1)?.text.match(/token=([0-9a-f]+)/);
  assert.ok(match, "a confirmation link was sent");
  return match[1];
};

/** Starts a change of this User's email; returns the token mailed for it. */
const changeEmail = async (user: InstanceType<typeof User>, email: string) => {
  await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, email },
    { user, req: anIp() },
  );
  return lastToken();
};

const confirm = (token: string, email: string) =>
  callResolver(confirmEmailResolver, { token, email }, { res });

const resend = (email: string) =>
  callResolver(
    resendConfirmationEmailResolver,
    { email, captchaToken: "resend_confirmation_email" },
    { req: anIp() },
  );

const stored = async (user: InstanceType<typeof User>) =>
  (await User.findById(user._id).lean())!;

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

useThrowawayMongod();

beforeEach(async () => {
  transport.reset();
  resetRateLimits();
  await User.deleteMany({});
});

// --- confirmEmail --------------------------------------------------------------

test("two Users pending one address: the first to confirm wins, the second gets EMAIL_TAKEN", async () => {
  const anna = await createUser("anna@x.de");
  const bob = await createUser("bob@x.de");
  const annaToken = await changeEmail(anna, "new@x.de");
  const bobToken = await changeEmail(bob, "new@x.de");

  const result = await confirm(annaToken, "new@x.de");
  assert.equal(result.user.id, anna.id);
  assert.equal(result.emailChanged, true);

  await assert.rejects(confirm(bobToken, "new@x.de"), withCode("EMAIL_TAKEN"));
  assert.equal((await stored(anna)).email, "new@x.de");
  assert.equal((await stored(bob)).email, "bob@x.de");
});

test("the first link doesn't depend on the order the changes were asked in", async () => {
  const anna = await createUser("anna@x.de");
  const bob = await createUser("bob@x.de");
  const annaToken = await changeEmail(anna, "new@x.de");
  const bobToken = await changeEmail(bob, "new@x.de");

  await confirm(bobToken, "new@x.de");
  await assert.rejects(confirm(annaToken, "new@x.de"), withCode("EMAIL_TAKEN"));
  assert.equal((await stored(bob)).email, "new@x.de");
});

test("a change to an address a confirmed User took first: EMAIL_TAKEN, the change cleared, the email kept", async () => {
  const anna = await createUser("anna@x.de");
  const token = await changeEmail(anna, "new@x.de");
  await createUser("new@x.de");

  await assert.rejects(confirm(token, "new@x.de"), withCode("EMAIL_TAKEN"));

  const after = await stored(anna);
  assert.equal(after.email, "anna@x.de");
  assert.equal(after.pendingEmail, null);
  assert.equal(after.emailConfirmationToken, null);
  assert.equal(after.emailConfirmationTokenExpires, null);
});

test("a change to an address an unconfirmed User holds: that User is deleted and the change applied", async () => {
  const anna = await createUser("anna@x.de");
  const token = await changeEmail(anna, "new@x.de");
  const squatter = await createUser("new@x.de", { isEmailConfirmed: false });

  const result = await confirm(token, "new@x.de");

  assert.equal(result.user.email, "new@x.de");
  assert.equal(await User.findById(squatter._id), null);
  assert.equal((await stored(anna)).email, "new@x.de");
});

test("the address taken between the check and the save: EMAIL_TAKEN, not a 500", async () => {
  const anna = await createUser("anna@x.de");
  const token = await changeEmail(anna, "new@x.de");
  await createUser("new@x.de");

  // The owner check misses the owner, as if it registered right after it.
  const findOne = User.findOne;
  User.findOne = function (this: typeof User, filter?: { email?: unknown }) {
    if (filter?.email !== undefined) return findOne.call(this, { _id: null });
    return findOne.call(this, filter);
  } as typeof User.findOne;
  try {
    await assert.rejects(confirm(token, "new@x.de"), withCode("EMAIL_TAKEN"));
  } finally {
    User.findOne = findOne;
  }

  const after = await stored(anna);
  assert.equal(after.email, "anna@x.de");
  assert.equal(after.pendingEmail, null);
  assert.equal(after.emailConfirmationToken, null);
});

test("one User's token with another User's address: INVALID_TOKEN", async () => {
  const anna = await createUser("anna@x.de");
  await createUser("bob@x.de", { pendingEmail: "bob-new@x.de" });
  const token = await changeEmail(anna, "new@x.de");

  await assert.rejects(confirm(token, "bob-new@x.de"), withCode("INVALID_TOKEN"));
  await assert.rejects(confirm(token, "bob@x.de"), withCode("INVALID_TOKEN"));
  await assert.rejects(confirm(token, "anna@x.de"), withCode("INVALID_TOKEN"));
  assert.equal((await stored(anna)).pendingEmail, "new@x.de");
});

test("a token that matches no User: INVALID_TOKEN", async () => {
  const anna = await createUser("anna@x.de");
  await changeEmail(anna, "new@x.de");

  await assert.rejects(confirm("ab".repeat(32), "new@x.de"), withCode("INVALID_TOKEN"));
});

test("registration is confirmed by its token", async () => {
  const anna = await createUser("anna@x.de", { isEmailConfirmed: false });
  await resend("anna@x.de");

  const result = await confirm(lastToken(), "anna@x.de");
  assert.equal(result.emailChanged, false);
  assert.equal((await stored(anna)).isEmailConfirmed, true);
});

// --- updatePersonalData ----------------------------------------------------------

test("an email change may target an address an unconfirmed User holds", async () => {
  const anna = await createUser("anna@x.de");
  await createUser("new@x.de", { isEmailConfirmed: false });

  const result = await callResolver(
    updatePersonalDataResolver,
    { userId: anna.id, email: "new@x.de" },
    { user: anna, req: anIp() },
  );
  assert.equal(result.pendingEmail, "new@x.de");
});

test("an email change to a confirmed User's address is refused", async () => {
  const anna = await createUser("anna@x.de");
  await createUser("new@x.de");

  await assert.rejects(
    callResolver(
      updatePersonalDataResolver,
      { userId: anna.id, email: "new@x.de" },
      { user: anna, req: anIp() },
    ),
    (error: unknown) => {
      assert.equal(clientCode(error), "BAD_USER_INPUT");
      assert.equal((error as Error).message, "User already exists with this email.");
      return true;
    },
  );
  assert.equal(transport.sent.length, 0);
});

// --- resendConfirmationEmail -----------------------------------------------------

test("resend: an unconfirmed owner gets the mail, not a User pending the address", async () => {
  const owner = await createUser("new@x.de", { isEmailConfirmed: false });
  const anna = await createUser("anna@x.de", { pendingEmail: "new@x.de" });

  assert.deepEqual(await resend("new@x.de"), { success: true });

  assert.equal(transport.sent.length, 1);
  assert.equal((await stored(owner)).emailConfirmationToken !== null, true);
  assert.equal((await stored(anna)).emailConfirmationToken ?? null, null);
});

test("resend: a confirmed owner means no mail, even with Users pending the address", async () => {
  await createUser("new@x.de");
  const anna = await createUser("anna@x.de", { pendingEmail: "new@x.de" });

  assert.deepEqual(await resend("new@x.de"), { success: true });

  assert.equal(transport.sent.length, 0);
  assert.equal((await stored(anna)).emailConfirmationToken ?? null, null);
});

test("resend: with no owner, the User pending the address with the latest link gets one mail", async () => {
  const hour = 60 * 60 * 1000;
  const anna = await createUser("anna@x.de", {
    pendingEmail: "new@x.de",
    emailConfirmationTokenExpires: new Date(Date.now() + hour),
  });
  const bob = await createUser("bob@x.de", {
    pendingEmail: "new@x.de",
    emailConfirmationTokenExpires: new Date(Date.now() + 2 * hour),
  });

  assert.deepEqual(await resend("new@x.de"), { success: true });

  assert.equal(transport.sent.length, 1);
  const result = await confirm(lastToken(), "new@x.de");
  assert.equal(result.user.id, bob.id);
  assert.equal((await stored(anna)).email, "anna@x.de");
});

test("resend: an address nobody holds answers success and sends nothing", async () => {
  assert.deepEqual(await resend("nobody@x.de"), { success: true });
  assert.equal(transport.sent.length, 0);
});
