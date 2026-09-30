/**
 * The HTTP surface outside GraphQL: no unscoped ImageKit upload signatures are
 * handed out, and `/coffee` responses (personalized queries and mutations
 * among them) are never marked for public caching.
 * Against the app started on a random port; no database is needed, since a
 * signed-out `{ __typename }` never reaches it.
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

// Apollo sets its own `no-store` on the responses it sends, so a public header
// set earlier only survived on responses Apollo never sees, like a preflight.
test("a /coffee CORS preflight carries no public Cache-Control header", async () => {
  const response = await fetch(`${baseUrl}/coffee`, {
    method: "OPTIONS",
    headers: {
      Origin: config.frontendUrl,
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(response.status, 204);
  assert.doesNotMatch(response.headers.get("cache-control") ?? "", /public/);
});

// The largest real request is an avatar: the client sends the picked file as
// is, up to 5 MB, base64-encoded (~6.7 MB). The limit is 7 MB.
const BODY_LIMIT_BYTES = 7 * 1024 * 1024;

test("a /coffee JSON body just over the limit gets 413", async () => {
  const envelope = JSON.stringify({ query: "{ __typename }", padding: "" });
  const padding = "a".repeat(BODY_LIMIT_BYTES + 1 - envelope.length);
  const body = JSON.stringify({ query: "{ __typename }", padding });
  assert.equal(Buffer.byteLength(body), BODY_LIMIT_BYTES + 1);

  const response = await fetch(`${baseUrl}/coffee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  assert.equal(response.status, 413);
});

test("a 5 MB avatar as base64 in a mutation gets past the body parser", async () => {
  const fileBuffer = Buffer.alloc(5 * 1024 * 1024, 1).toString("base64");

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
