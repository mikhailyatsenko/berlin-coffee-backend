/**
 * The HTTP surface outside GraphQL: no unscoped ImageKit upload signatures are
 * handed out, and `/coffee` responses (personalized queries and mutations
 * among them) are never marked for public caching, and a `/coffee` JSON body
 * is capped at the size the largest real upload needs.
 * Against the app started on a random port; no database is needed, since
 * signed-out requests never reach it.
 *
 * Run: npm test
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { setTestEnv } from "./support/mongod.js";

setTestEnv();

const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config/config.js");

let httpServer: http.Server;
let baseUrl: string;

before(async () => {
  ({ httpServer } = await createApp());
  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

test("GET /imagekit/auth answers 404", async () => {
  const response = await fetch(`${baseUrl}/imagekit/auth`);

  assert.equal(response.status, 404);
});

test("a /coffee response carries no public Cache-Control header", async () => {
  const response = await fetch(`${baseUrl}/coffee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { __typename: "Query" } });
  assert.doesNotMatch(response.headers.get("cache-control") ?? "", /public/);
});

const preflightFrom = (origin: string) =>
  fetch(`${baseUrl}/coffee`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });

// Apollo sets its own `no-store` on the responses it sends, so a public header
// set earlier only survived on responses Apollo never sees, like a preflight.
test("a /coffee CORS preflight carries no public Cache-Control header", async () => {
  const response = await preflightFrom(config.frontendUrl);

  assert.equal(response.status, 204);
  assert.doesNotMatch(response.headers.get("cache-control") ?? "", /public/);
});

test("outside production, a /coffee preflight from localhost on another port is allowed", async () => {
  const response = await preflightFrom("http://localhost:5199");

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:5199",
  );
});

test("a /coffee preflight from a foreign origin is not allowed", async () => {
  const response = await preflightFrom("http://example.com");

  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

// JSON_BODY_LIMIT in src/app.ts.
const BODY_LIMIT_BYTES = 7 * 1024 * 1024;
// The client sends an avatar unresized, up to this size.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

test("a /coffee JSON body just over the limit gets 413", async () => {
  const bodyWith = (padding: string) =>
    JSON.stringify({ query: "{ __typename }", padding });
  const body = bodyWith(
    "a".repeat(BODY_LIMIT_BYTES + 1 - bodyWith("").length),
  );
  assert.equal(Buffer.byteLength(body), BODY_LIMIT_BYTES + 1);

  const response = await fetch(`${baseUrl}/coffee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  assert.equal(response.status, 413);
});

test("a 5 MB avatar as base64 in a mutation gets past the body parser", async () => {
  const fileBuffer = Buffer.alloc(MAX_AVATAR_BYTES, 1).toString("base64");

  const response = await fetch(`${baseUrl}/coffee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation ($userId: ID!, $fileBuffer: String!, $fileName: String!) {
        uploadAvatar(userId: $userId, fileBuffer: $fileBuffer, fileName: $fileName) { success }
      }`,
      variables: { userId: "u1", fileBuffer, fileName: "avatar.jpg" },
    }),
  });

  // Signed out, so the resolver refuses it: the body was parsed and reached it.
  const result = (await response.json()) as {
    errors?: { extensions?: { code?: string } }[];
  };
  assert.equal(result.errors?.[0]?.extensions?.code, "UNAUTHENTICATED");
});
