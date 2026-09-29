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
