/**
 * The mail module: who gets which mail, escaping in the HTML body, what a
 * failed send does, and the per-IP limits on the forms that mail the admin.
 * Against a throwaway mongod, a recording mail transport and a fake reCAPTCHA.
 *
 * Run: npm test
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { RecordingTransport } from "./support/mailTransport.js";

const ADMIN_EMAIL = "admin@test.invalid";
setTestEnv({ ADMIN_EMAIL });

const { setMailTransport } = await import("../src/mail/transport.js");
const { default: User } = await import("../src/models/User.js");
const { contactFormResolver } = await import(
  "../src/graphql/resolvers/contactFormResolver/contactFormResolver.js"
);
const { reportInaccuracyResolver } = await import(
  "../src/graphql/resolvers/reportInaccuracyResolver/reportInaccuracyResolver.js"
);
const { registerUserResolver } = await import(
  "../src/graphql/resolvers/registerUser/registerUserResolver.js"
);
import { callResolver } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

const transport = new RecordingTransport();
setMailTransport(transport);

// --- fake reCAPTCHA: every token passes for the action it is checked for ----

let captchaAction = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, action: captchaAction, score: 0.9 }),
})) as unknown as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

// --- helpers -----------------------------------------------------------------

let nextIp = 0;
/** A fresh client address, so no test shares a rate-limit window with another. */
const anIp = () => ({ ip: `10.0.0.${++nextIp}` }) as never;

const contact = (
  fields: { name?: string; message?: string } = {},
  req = anIp(),
) => {
  captchaAction = "contact_form";
  return callResolver(
    contactFormResolver,
    {
      name: fields.name ?? "Anna",
      email: "anna@example.com",
      message: fields.message ?? "Hello there",
      captchaToken: "ok",
    },
    { req },
  );
};

const report = (req = anIp()) => {
  captchaAction = "report_inaccuracy";
  return callResolver(
    reportInaccuracyResolver,
    {
      placeId: "place-1",
      placeName: "Bonanza",
      message: "Closed on Mondays",
      captchaToken: "ok",
    },
    { req },
  );
};

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

/** Runs fn with console.error captured, returning what it logged. */
async function capturingErrors(fn: () => Promise<unknown>) {
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    await fn();
  } finally {
    console.error = originalError;
  }
  return logged;
}

useThrowawayMongod();

beforeEach(async () => {
  transport.reset();
  await User.deleteMany({});
});

// --- tests -------------------------------------------------------------------

test("a contact message is one mail to the admin, replying to the submitter", async () => {
  const result = await contact();

  assert.deepEqual(result, { success: true, name: "Anna" });
  assert.equal(transport.sent.length, 1);
  const [mail] = transport.sent;
  assert.equal(mail.to, ADMIN_EMAIL);
  assert.equal(mail.replyTo, "anna@example.com");
  assert.ok(mail.text.includes("Hello there"));
});

test("markup in a name or message arrives escaped in the HTML body and as typed in the text part", async () => {
  const name = `<script>alert("x")</script>`;
  const message = `a "quoted" <b>word</b> & more`;

  await contact({ name, message });

  const [mail] = transport.sent;
  assert.ok(!mail.html.includes("<script>"), mail.html);
  assert.ok(!mail.html.includes("<b>"), mail.html);
  assert.ok(
    mail.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"),
    mail.html,
  );
  assert.ok(
    mail.html.includes(
      "a &quot;quoted&quot; &lt;b&gt;word&lt;/b&gt; &amp; more",
    ),
    mail.html,
  );
  assert.ok(mail.text.includes(name));
  assert.ok(mail.text.includes(message));
});

test("a failed send fails a contact message with INTERNAL_SERVER_ERROR", async () => {
  transport.fails = true;

  await capturingErrors(() =>
    assert.rejects(contact(), withCode("INTERNAL_SERVER_ERROR")),
  );
});

test("an inaccuracy report is one mail to the admin; a failed send fails it", async () => {
  const result = await report();

  assert.deepEqual(result, { success: true, placeName: "Bonanza" });
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0].to, ADMIN_EMAIL);
  assert.ok(transport.sent[0].text.includes("Closed on Mondays"));

  transport.fails = true;
  await capturingErrors(() =>
    assert.rejects(report(), withCode("INTERNAL_SERVER_ERROR")),
  );
});

test("a failed send on registration still creates the User and succeeds, and is logged", async () => {
  transport.fails = true;
  captchaAction = "register_user";

  const logged = await capturingErrors(async () => {
    const result = await callResolver(
      registerUserResolver,
      {
        email: "new@example.com",
        displayName: "New",
        password: "correct-horse",
        captchaToken: "ok",
      },
      { req: anIp() },
    );
    assert.deepEqual(result, { success: true });
  });

  assert.ok(await User.exists({ email: "new@example.com" }));
  assert.equal(logged.length, 1);
});

test("the 6th contact message from one IP within an hour is RATE_LIMITED", async () => {
  const req = anIp();
  for (let i = 0; i < 5; i++) await contact({}, req);

  await assert.rejects(contact({}, req), withCode("RATE_LIMITED"));
  assert.equal(transport.sent.length, 5);
  // Another address is not affected.
  await contact();
});

test("the 6th inaccuracy report from one IP within an hour is RATE_LIMITED", async () => {
  const req = anIp();
  for (let i = 0; i < 5; i++) await report(req);

  await assert.rejects(report(req), withCode("RATE_LIMITED"));
  assert.equal(transport.sent.length, 5);
});
