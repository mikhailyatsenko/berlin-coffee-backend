/**
 * The config module: validated once at startup, the mode decides the domains
 * and cookie settings.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { setTestEnv } from "./support/mongod.js";
import { callResolver } from "./support/callResolver.js";

setTestEnv();

const { buildConfig, config } = await import("../src/config/config.js");
const { logoutResolver } = await import(
  "../src/graphql/resolvers/logoutReslover/logoutReslover.js"
);

const validEnv = (overrides: Record<string, string | undefined> = {}) => ({
  MONGO_URI: "mongodb://127.0.0.1/test",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  JWT_SECRET: "jwt-secret",
  MAILERSEND_API_KEY: "mailersend",
  NODE_ENV: "development",
  IMAGEKIT_PUBLIC_KEY: "ik-public",
  IMAGEKIT_PRIVATE_KEY: "ik-private",
  IMAGEKIT_URL_ENDPOINT: "https://ik.invalid/test",
  RECAPTCHA_V3_SECRET: "recaptcha",
  PLACE_SUGGESTION_REVIEW_SECRET: "review-secret",
  GOOGLE_PLACES_API_KEY: "places-key",
  ...overrides,
});

test("an unknown NODE_ENV fails with a message naming the allowed modes", () => {
  assert.throws(
    () => buildConfig(validEnv({ NODE_ENV: "staging" })),
    /NODE_ENV must be one of production, development, test; got "staging"/,
  );
});

test("a missing NODE_ENV fails", () => {
  assert.throws(
    () => buildConfig(validEnv({ NODE_ENV: undefined })),
    /NODE_ENV must be one of production, development, test; it is not set/,
  );
});

test("a missing required variable fails, naming every missing one", () => {
  assert.throws(
    () =>
      buildConfig(validEnv({ JWT_SECRET: undefined, GOOGLE_PLACES_API_KEY: "" })),
    /Missing required environment variables: JWT_SECRET, GOOGLE_PLACES_API_KEY/,
  );
});

test("production serves 3welle.com with cross-site secure cookies on api.3welle.com", () => {
  const prod = buildConfig(validEnv({ NODE_ENV: "production" }));

  assert.equal(prod.isProduction, true);
  assert.equal(prod.frontendUrl, "https://3welle.com");
  assert.deepEqual(prod.authCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    domain: "api.3welle.com",
    path: "/",
  });
  assert.deepEqual(prod.accessTokenCookie, {
    ...prod.authCookie,
    maxAge: 15 * 60 * 1000,
  });
  assert.deepEqual(prod.refreshTokenCookie, {
    ...prod.authCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
});

for (const mode of ["development", "test"]) {
  test(`${mode} serves localhost:5173 with lax cookies on localhost`, () => {
    const local = buildConfig(validEnv({ NODE_ENV: mode }));

    assert.equal(local.isProduction, false);
    assert.equal(local.frontendUrl, "http://localhost:5173");
    assert.deepEqual(local.authCookie, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      domain: "localhost",
      path: "/",
    });
  });
}

test("the upload timeouts default to the production values and can be shortened", () => {
  const defaults = buildConfig(validEnv());
  assert.equal(defaults.photoUploadTimeoutMs, 30_000);
  assert.equal(defaults.reviewImageAbandonedLeaseMs, 10 * 60_000);

  const shortened = buildConfig(
    validEnv({
      REVIEW_IMAGE_UPLOAD_TIMEOUT_MS: "300",
      REVIEW_IMAGE_ABANDONED_LEASE_MS: "800",
    }),
  );
  assert.equal(shortened.photoUploadTimeoutMs, 300);
  assert.equal(shortened.reviewImageAbandonedLeaseMs, 800);
});

test("logout clears both auth cookies with the settings they were set with", async () => {
  const cleared: [string, unknown][] = [];
  const res = {
    clearCookie: (name: string, options: unknown) => cleared.push([name, options]),
  } as unknown as Response;

  await callResolver(logoutResolver, {}, { res });

  assert.deepEqual(cleared, [
    ["jwt", config.authCookie],
    ["refreshToken", config.authCookie],
  ]);
});
