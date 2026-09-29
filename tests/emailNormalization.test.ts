/**
 * One canonical form for an email address (trimmed, lowercase) on every write
 * and every lookup, so the same address in a different case is the same User.
 * Against a throwaway mongod, a fake mail transport, a fake reCAPTCHA and a fake
 * Google OAuth client.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { Response } from "express";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { setMailTransport } = await import("../src/mail/transport.js");
const { OAuth2Client } = await import("google-auth-library");
const { default: User } = await import("../src/models/User.js");
const { normalizeEmail } = await import("../src/utils/normalizeEmail.js");
const { resetRateLimits } = await import("../src/utils/rateLimit.js");
const { registerUserResolver } = await import(
  "../src/graphql/resolvers/registerUser/registerUserResolver.js"
);
const { signInWithEmailResolver } = await import(
  "../src/graphql/resolvers/signInWithEmailResolver/signInWithEmailResolver.js"
);
const { resendConfirmationEmailResolver } = await import(
  "../src/graphql/resolvers/registerUser/resendConfirmationEmailResolver.js"
);
const { confirmEmailResolver } = await import(
  "../src/graphql/resolvers/registerUser/confirmEmailResolver.js"
);
const { updatePersonalDataResolver } = await import(
  "../src/graphql/resolvers/updatePersonalDataResolver/updatePersonalDataResolver.js"
);
const { requestPasswordResetResolver } = await import(
  "../src/graphql/resolvers/passwordReset/requestPasswordResetResolver.js"
);
const { loginWithGoogleResolver } = await import(
  "../src/graphql/resolvers/loginWithGoogleResolver/loginWithGoogleResolver.js"
);
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";
import { RecordingTransport } from "./support/mailTransport.js";

// --- fake mail transport: keeps who got mail and the link in it -------------

const transport = new RecordingTransport();
setMailTransport(transport);
const sent = transport.sent;

/** The token from the confirmation link in the last email sent. */
const lastConfirmationToken = () => {
  const match = sent.at(-1)?.text.match(/token=([0-9a-f]+)/);
  assert.ok(match, "a confirmation link was sent");
  return match[1];
};

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

// --- fake Google: the next sign-in is this Google account --------------------

let googlePayload = { sub: "google-1", email: "", email_verified: true, name: "Anna" };
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

const register = (email: string) =>
  callResolver(
    registerUserResolver,
    { email, displayName: "Anna", password: PASSWORD, captchaToken: "register_user" },
    { req: { ip: "127.0.0.1" } as never },
  );

const createUser = async (email: string, fields: object = {}) =>
  User.create({
    email,
    displayName: "Anna",
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
    ...fields,
  });

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

useThrowawayMongod();

beforeEach(async () => {
  sent.length = 0;
  // Every test mails anna@x.de, more often than its recipient limit allows.
  resetRateLimits();
  await User.deleteMany({});
});

// --- tests -------------------------------------------------------------------

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Anna@X.de \n"), "anna@x.de");
});

test("register as ' Anna@X.de ', then sign in as anna@x.de: success, stored as anna@x.de", async () => {
  await register(" Anna@X.de ");

  const stored = await User.findOne({}).lean();
  assert.equal(stored?.email, "anna@x.de");
  assert.equal(sent.at(-1)?.to, "anna@x.de");

  await User.updateOne({}, { isEmailConfirmed: true });
  const result = await callResolver(
    signInWithEmailResolver,
    { email: "anna@x.de", password: PASSWORD },
    { res },
  );
  assert.equal(result?.user.email, "anna@x.de");
});

test("sign in with a differently cased address finds the User", async () => {
  await createUser("anna@x.de");
  const result = await callResolver(
    signInWithEmailResolver,
    { email: " ANNA@x.DE", password: PASSWORD },
    { res },
  );
  assert.equal(result?.user.email, "anna@x.de");
});

test("registering anna@x.de when ANNA@x.de exists: already exists", async () => {
  await register("ANNA@x.de");
  await assert.rejects(register("anna@x.de"), withCode("BAD_USER_INPUT"));
  await assert.rejects(register(" Anna@X.de"), withCode("BAD_USER_INPUT"));
  assert.equal(await User.countDocuments(), 1);
});

test("resend confirmation matches regardless of case", async () => {
  await createUser("anna@x.de", { isEmailConfirmed: false });
  const result = await callResolver(resendConfirmationEmailResolver, {
    email: "ANNA@X.DE ",
    captchaToken: "resend_confirmation_email",
  });
  assert.equal(result?.success, true);
  assert.equal(sent.at(-1)?.to, "anna@x.de");
});

test("resend for a pending email change matches regardless of case", async () => {
  await createUser("anna@x.de", { pendingEmail: "new@x.de" });
  await callResolver(resendConfirmationEmailResolver, {
    email: "New@X.de",
    captchaToken: "resend_confirmation_email",
  });
  assert.equal(sent.at(-1)?.to, "new@x.de");
  assert.match(sent.at(-1)!.text, /email=new%40x\.de/);
});

test("confirm matches regardless of case", async () => {
  await register("anna@x.de");
  const token = lastConfirmationToken();

  const result = await callResolver(
    confirmEmailResolver,
    { token, email: " Anna@X.DE" },
    { res },
  );
  assert.equal(result?.user.email, "anna@x.de");
  assert.equal((await User.findOne({}).lean())?.isEmailConfirmed, true);
});

test("email change: stored and confirmed regardless of case", async () => {
  const user = await createUser("anna@x.de");

  const changed = await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, email: " New@X.de " },
    { user },
  );
  assert.equal(changed?.pendingEmail, "new@x.de");
  assert.equal((await User.findById(user._id).lean())?.pendingEmail, "new@x.de");
  assert.equal(sent.at(-1)?.to, "new@x.de");

  const token = lastConfirmationToken();
  const confirmed = await callResolver(
    confirmEmailResolver,
    { token, email: "NEW@x.de" },
    { res },
  );
  assert.equal(confirmed?.emailChanged, true);
  assert.equal(confirmed?.user.email, "new@x.de");
});

test("email change to the same address in another case is no change", async () => {
  const user = await createUser("anna@x.de");
  const result = await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, email: "Anna@X.de" },
    { user },
  );
  assert.equal(result?.pendingEmail, null);
  assert.equal(sent.length, 0);
});

test("email change to a blank address: BAD_USER_INPUT", async () => {
  const user = await createUser("anna@x.de");
  await assert.rejects(
    callResolver(
      updatePersonalDataResolver,
      { userId: user.id, email: "   " },
      { user },
    ),
    withCode("BAD_USER_INPUT"),
  );
});

test("email change to another User's address in another case: already exists", async () => {
  await createUser("taken@x.de");
  const user = await createUser("anna@x.de");
  await assert.rejects(
    callResolver(
      updatePersonalDataResolver,
      { userId: user.id, email: "Taken@X.de" },
      { user },
    ),
    withCode("BAD_USER_INPUT"),
  );
});

test("password reset request finds the User regardless of case", async () => {
  await createUser("anna@x.de");
  await callResolver(requestPasswordResetResolver, {
    email: " ANNA@x.de",
    captchaToken: "request_password_reset",
  });
  assert.equal(sent.at(-1)?.to, "anna@x.de");
});

test("Google sign-in stores the email in canonical form", async () => {
  googlePayload = {
    sub: "google-1",
    email: "Anna@Gmail.COM",
    email_verified: true,
    name: "Anna",
  };
  const result = await callResolver(
    loginWithGoogleResolver,
    { code: "code" },
    { res },
  );
  assert.equal(result?.user.email, "anna@gmail.com");
  assert.equal((await User.findOne({}).lean())?.email, "anna@gmail.com");
});

test("the model stores email and pendingEmail in canonical form", async () => {
  const user = await createUser(" Anna@X.de ", { pendingEmail: " New@X.de" });
  const stored = await User.findById(user._id).lean();
  assert.equal(stored?.email, "anna@x.de");
  assert.equal(stored?.pendingEmail, "new@x.de");
});
