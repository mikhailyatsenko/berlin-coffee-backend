/**
 * Abuse limits on sign-in and on mail to a caller-supplied address: per-IP and
 * per-email buckets on sign-in, a per-recipient bucket inside the mail module,
 * per-IP buckets on reset / resend / register / email change, and reCAPTCHA
 * on reset and resend. Against a throwaway mongod, a recording mail transport
 * and a fake reCAPTCHA.
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
const { signInWithEmailResolver } = await import(
  "../src/graphql/resolvers/signInWithEmailResolver/signInWithEmailResolver.js"
);
const { requestPasswordResetResolver } = await import(
  "../src/graphql/resolvers/passwordReset/requestPasswordResetResolver.js"
);
const { resendConfirmationEmailResolver } = await import(
  "../src/graphql/resolvers/registerUser/resendConfirmationEmailResolver.js"
);
const { registerUserResolver } = await import(
  "../src/graphql/resolvers/registerUser/registerUserResolver.js"
);
const { updatePersonalDataResolver } = await import(
  "../src/graphql/resolvers/updatePersonalDataResolver/updatePersonalDataResolver.js"
);
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

const transport = new RecordingTransport();
setMailTransport(transport);

// --- fake reCAPTCHA: a token passes for the action it is checked for, unless
// captchaPasses is off ---------------------------------------------------------

let captchaPasses = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const token = new URLSearchParams(init?.body).get("response");
  return {
    ok: true,
    status: 200,
    // The token names the action it was minted for.
    json: async () => ({ success: captchaPasses, action: token, score: 0.9 }),
  };
}) as unknown as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

// --- helpers -----------------------------------------------------------------

let nextIp = 0;
/** A fresh client address, so no test shares a per-IP window with another. */
const anIp = () => ({ ip: `10.0.1.${++nextIp}` }) as never;

let nextAddress = 0;
/** A fresh address, so no test shares a per-email window with another. */
const anAddress = () => `person${++nextAddress}@example.com`;

const res = {
  cookie: () => res,
  setHeader: () => res,
} as unknown as Response;

const PASSWORD = "correct-horse";

const createUser = async (email: string, fields: object = {}) =>
  User.create({
    email,
    displayName: "Anna",
    password: await bcrypt.hash(PASSWORD, 4),
    isEmailConfirmed: true,
    ...fields,
  });

const signIn = (email: string, password: string, req = anIp()) =>
  callResolver(signInWithEmailResolver, { email, password }, { req, res });

/** A password reset with a token minted for its action, unless given another. */
const requestReset = (
  email: string,
  { req = anIp(), captchaToken = "request_password_reset" as string | null } = {},
) => callResolver(requestPasswordResetResolver, { email, captchaToken }, { req });

/** A resend with a token minted for its action, unless given another. */
const resend = (
  email: string,
  { req = anIp(), captchaToken = "resend_confirmation_email" as string | null } = {},
) =>
  callResolver(resendConfirmationEmailResolver, { email, captchaToken }, { req });

const register = (email: string, req = anIp()) =>
  callResolver(
    registerUserResolver,
    { email, displayName: "Anna", password: PASSWORD, captchaToken: "register_user" },
    { req },
  );

const changeEmail = async (email: string, req = anIp()) => {
  const user = await createUser(anAddress());
  const result = await callResolver(
    updatePersonalDataResolver,
    { userId: user.id, email },
    { user, req },
  );
  return { user, result };
};

/** How many mails went to this address. */
const mailsTo = (email: string) =>
  transport.sent.filter((mail) => mail.to === email).length;

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

useThrowawayMongod();

beforeEach(async () => {
  transport.reset();
  captchaPasses = true;
  await User.deleteMany({});
});

// --- sign-in -----------------------------------------------------------------

test("sign-in: the 21st attempt from one IP within 15 minutes is RATE_LIMITED", async () => {
  const req = anIp();
  for (let i = 0; i < 20; i++) {
    await assert.rejects(
      signIn(anAddress(), "wrong", req),
      withCode("BAD_USER_INPUT"),
    );
  }

  await assert.rejects(signIn(anAddress(), "wrong", req), withCode("RATE_LIMITED"));
  // Another address is not affected.
  await assert.rejects(signIn(anAddress(), "wrong"), withCode("BAD_USER_INPUT"));
});

test("sign-in: the 11th failure for one email within an hour is RATE_LIMITED without checking the password", async () => {
  const email = anAddress();
  await createUser(email);
  for (let i = 0; i < 10; i++) {
    await assert.rejects(signIn(email, "wrong"), withCode("BAD_USER_INPUT"));
  }

  const originalCompare = bcrypt.compare;
  let compared = 0;
  bcrypt.compare = (async (data: string, encrypted: string) => {
    compared += 1;
    return originalCompare(data, encrypted);
  }) as unknown as typeof bcrypt.compare;
  try {
    // Even the right password, and in another case, from another IP.
    await assert.rejects(
      signIn(email.toUpperCase(), PASSWORD),
      withCode("RATE_LIMITED"),
    );
  } finally {
    bcrypt.compare = originalCompare;
  }
  assert.equal(compared, 0);
});

test("sign-in: successes don't count toward the email's failures", async () => {
  const email = anAddress();
  await createUser(email);
  for (let i = 0; i < 9; i++) {
    await assert.rejects(signIn(email, "wrong"), withCode("BAD_USER_INPUT"));
  }
  for (let i = 0; i < 5; i++) {
    const result = await signIn(email, PASSWORD);
    assert.equal(result?.user.email, email);
  }

  // The 10th failure is still answered as a wrong password.
  await assert.rejects(signIn(email, "wrong"), withCode("BAD_USER_INPUT"));
});

test("sign-in with a password to a Google-only User: 'Invalid e-mail or password'", async () => {
  const email = anAddress();
  await User.create({
    email,
    displayName: "Anna",
    googleId: "google-1",
    isEmailConfirmed: true,
  });

  await assert.rejects(signIn(email, PASSWORD), (error: unknown) => {
    assert.equal(clientCode(error), "BAD_USER_INPUT");
    assert.equal((error as Error).message, "Invalid e-mail or password");
    return true;
  });
});

// --- captcha on reset and resend ----------------------------------------------

for (const [name, call] of [
  ["password reset", requestReset],
  ["resend confirmation", resend],
] as const) {
  test(`${name} without a captcha token is CAPTCHA_FAILED and sends nothing`, async () => {
    const email = anAddress();
    await createUser(email, { isEmailConfirmed: false });

    await assert.rejects(call(email, { captchaToken: null }), withCode("CAPTCHA_FAILED"));
    assert.equal(transport.sent.length, 0);
  });

  test(`${name} with a failing captcha is CAPTCHA_FAILED and sends nothing`, async () => {
    const email = anAddress();
    await createUser(email, { isEmailConfirmed: false });
    captchaPasses = false;

    await assert.rejects(call(email), withCode("CAPTCHA_FAILED"));
    assert.equal(transport.sent.length, 0);
  });

  test(`${name} with a token minted for another form is CAPTCHA_FAILED`, async () => {
    const email = anAddress();
    await createUser(email, { isEmailConfirmed: false });

    await assert.rejects(
      call(email, { captchaToken: "register_user" }),
      withCode("CAPTCHA_FAILED"),
    );
  });
}

// --- resend doesn't say whether the address has an account --------------------

test("resend for an unknown address: success, no mail", async () => {
  assert.deepEqual(await resend(anAddress()), { success: true });
  assert.equal(transport.sent.length, 0);
});

test("resend for an already-confirmed address: success, no mail", async () => {
  const email = anAddress();
  await createUser(email);

  assert.deepEqual(await resend(email), { success: true });
  assert.equal(transport.sent.length, 0);
});

test("resend for an unconfirmed User: success, a confirmation mail", async () => {
  const email = anAddress();
  await createUser(email, { isEmailConfirmed: false });

  assert.deepEqual(await resend(email), { success: true });
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0].to, email);
});

// --- per-recipient bucket in the mail module ----------------------------------

test("the 4th password reset mail to one address within an hour is not sent, and the reset still answers success", async () => {
  const email = anAddress();
  await createUser(email);
  for (let i = 0; i < 3; i++) await requestReset(email);
  const before = await User.findOne({ email }).lean();

  assert.deepEqual(await requestReset(email), { success: true });
  assert.equal(mailsTo(email), 3);
  const after = await User.findOne({ email }).lean();
  assert.equal(after?.passwordResetToken, before?.passwordResetToken);
});

test("the 4th resend to one address within an hour is not sent, and the resend still answers success", async () => {
  const email = anAddress();
  await createUser(email, { isEmailConfirmed: false });
  for (let i = 0; i < 3; i++) await resend(email);
  const before = await User.findOne({ email }).lean();

  assert.deepEqual(await resend(email), { success: true });
  assert.equal(mailsTo(email), 3);
  const after = await User.findOne({ email }).lean();
  assert.equal(after?.emailConfirmationToken, before?.emailConfirmationToken);
});

test("registering an address that already got 3 mails this hour is RATE_LIMITED and creates no User", async () => {
  const email = anAddress();
  // Someone else's pending email change, resent three times.
  await createUser(anAddress(), { pendingEmail: email });
  for (let i = 0; i < 3; i++) await resend(email);

  await assert.rejects(register(email), withCode("RATE_LIMITED"));
  assert.equal(await User.exists({ email }), null);
  assert.equal(mailsTo(email), 3);
});

test("an email change to an address that already got 3 mails this hour is RATE_LIMITED and stores no pendingEmail", async () => {
  const email = anAddress();
  for (let i = 0; i < 3; i++) await changeEmail(email);

  const user = await createUser(anAddress());
  await assert.rejects(
    callResolver(updatePersonalDataResolver, { userId: user.id, email }, { user, req: anIp() }),
    withCode("RATE_LIMITED"),
  );
  const stored = await User.findById(user._id).lean();
  assert.equal(stored?.pendingEmail ?? null, null);
  assert.equal(stored?.emailConfirmationToken ?? null, null);
  assert.equal(mailsTo(email), 3);
});

test("mixed-case variants of one address share a recipient bucket", async () => {
  const email = anAddress();
  await createUser(email);
  await requestReset(email.toUpperCase());
  await requestReset(` ${email} `);
  await requestReset(email[0].toUpperCase() + email.slice(1));

  await requestReset(email);
  assert.equal(mailsTo(email), 3);
});

test("a recipient bucket doesn't touch another address", async () => {
  const email = anAddress();
  await createUser(email);
  for (let i = 0; i < 4; i++) await requestReset(email);

  const other = anAddress();
  await createUser(other);
  await requestReset(other);
  assert.equal(mailsTo(other), 1);
});

// --- per-IP buckets on the operations that mail a typed address ---------------

for (const [name, call] of [
  ["password reset", (req: never) => requestReset(anAddress(), { req })],
  ["resend confirmation", (req: never) => resend(anAddress(), { req })],
  ["registration", (req: never) => register(anAddress(), req)],
  ["email change", (req: never) => changeEmail(anAddress(), req)],
] as const) {
  test(`the 6th ${name} from one IP within an hour is RATE_LIMITED`, async () => {
    const req = anIp();
    for (let i = 0; i < 5; i++) await call(req);

    await assert.rejects(call(req), withCode("RATE_LIMITED"));
    // Another IP is not affected.
    await call(anIp());
  });
}

test("reset and resend to one address share its recipient bucket", async () => {
  const email = anAddress();
  await createUser(email, { isEmailConfirmed: false });
  await requestReset(email);
  await resend(email);
  await requestReset(email);

  assert.deepEqual(await resend(email), { success: true });
  assert.equal(mailsTo(email), 3);
});
