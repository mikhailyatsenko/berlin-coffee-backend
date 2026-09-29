/**
 * The error contract: which errors reach the client as authored and which are
 * masked, run through a real ApolloServer with the server's own formatError.
 *
 * Run: npm test
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ApolloServer } from "@apollo/server";
import {
  GraphQLError,
  GraphQLScalarType,
  Kind,
  type GraphQLFormattedError,
} from "graphql";
import type { Response } from "express";
import type { IUser } from "../src/models/User.js";
import { formatError } from "../src/graphql/formatError.js";
import { requireUser } from "../src/graphql/context.js";
import {
  appError,
  badInput,
  forbidden,
  notFound,
  unauthenticated,
} from "../src/graphql/errors.js";

// --- captured console.error --------------------------------------------------

let logged: unknown[][] = [];
const originalConsoleError = console.error;

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
});

// --- a toy schema run through the real formatError ---------------------------

let thrown: unknown;

// A custom scalar that rejects bad input with a plain TypeError, as
// graphql-type-json's do: the client's mistake, not the server's.
const Even = new GraphQLScalarType({
  name: "Even",
  parseValue(value) {
    if (typeof value !== "number" || value % 2 !== 0) {
      throw new TypeError(`Even cannot represent ${String(value)}`);
    }
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.INT || Number(ast.value) % 2 !== 0) {
      throw new TypeError("Even cannot represent an odd literal");
    }
    return Number(ast.value);
  },
});

const server = new ApolloServer({
  typeDefs: `
    scalar Even
    type Query { boom: String, half(n: Int, even: Even): Int }
  `,
  resolvers: {
    Even,
    Query: {
      boom: () => {
        throw thrown;
      },
      half: () => 1,
    },
  },
  formatError,
  // Apollo adds `stacktrace` in development; the contract drops it anyway.
  includeStacktraceInErrorResponses: true,
});

async function errorsOf(
  query = "{ boom }",
  variables?: Record<string, unknown>,
): Promise<readonly GraphQLFormattedError[]> {
  const response = await server.executeOperation({ query, variables });
  assert.equal(response.body.kind, "single");
  if (response.body.kind !== "single") throw new Error("unreachable");
  return response.body.singleResult.errors ?? [];
}

// --- formatError ---------------------------------------------------------------

test("an unexpected error reaches the client as INTERNAL_SERVER_ERROR with the generic message and nothing else, and is logged once", async () => {
  thrown = new Error("MongoServerError: E11000 duplicate key in users.email");

  const [error] = await errorsOf();

  assert.equal(error.message, "Something went wrong. Please try again.");
  assert.deepEqual(error.extensions, { code: "INTERNAL_SERVER_ERROR" });
  assert.deepEqual(error.path, ["boom"]);

  assert.equal(logged.length, 1);
  const logLine = logged[0].map(String).join(" ");
  assert.ok(logLine.includes("boom"), "the log names the operation path");
  assert.ok(
    logged[0].includes(thrown),
    "the log carries the error with its stack",
  );
});

test("a plain object thrown from a resolver is masked too", async () => {
  thrown = { message: "raw ImageKit response" };

  const [error] = await errorsOf();

  assert.equal(error.message, "Something went wrong. Please try again.");
  assert.deepEqual(error.extensions, { code: "INTERNAL_SERVER_ERROR" });
});

test("an authored error's message and extensions reach the client unchanged; stacktrace never does; it is not logged", async () => {
  thrown = new GraphQLError("Too many requests, please try again later", {
    extensions: {
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
      reason: "secret_mismatch",
      existingPlaceId: "0123456789abcdef01234567",
    },
  });

  const [error] = await errorsOf();

  assert.equal(error.message, "Too many requests, please try again later");
  assert.deepEqual(error.extensions, {
    code: "RATE_LIMITED",
    retryAfterSeconds: 42,
    reason: "secret_mismatch",
    existingPlaceId: "0123456789abcdef01234567",
  });
  assert.equal(logged.length, 0);
});

test("Apollo's own validation errors pass through with their code", async () => {
  const [error] = await errorsOf("{ nope }");

  assert.equal(error.extensions?.code, "GRAPHQL_VALIDATION_FAILED");
  assert.ok(error.message.includes("nope"));
  assert.equal(error.extensions?.stacktrace, undefined);
  assert.equal(logged.length, 0);
});

test("variable coercion errors pass through as BAD_USER_INPUT, even when a custom scalar threw a plain error", async () => {
  for (const [query, variables] of [
    ["query ($n: Int) { half(n: $n) }", { n: "a" }],
    ["query ($e: Even) { half(even: $e) }", { e: 3 }],
  ] as const) {
    const [error] = await errorsOf(query, variables);

    assert.equal(error.extensions?.code, "BAD_USER_INPUT", query);
    assert.notEqual(error.message, "Something went wrong. Please try again.");
  }
  assert.equal(logged.length, 0);
});

test("a custom scalar's plain error in a literal passes as a validation error", async () => {
  const [error] = await errorsOf("{ half(even: 3) }");

  assert.equal(error.extensions?.code, "GRAPHQL_VALIDATION_FAILED");
  assert.equal(logged.length, 0);
});

test("a raw error Apollo wrapped outside any resolver (e.g. context creation) is masked", () => {
  // What Apollo hands formatError when the context function throws.
  const cause = new Error("connect ECONNREFUSED 127.0.0.1:27017");
  const wrapped = new GraphQLError(
    `Context creation failed: ${cause.message}`,
    {
      originalError: cause,
    },
  );

  const formatted = formatError(
    { message: wrapped.message, extensions: { code: "INTERNAL_SERVER_ERROR" } },
    wrapped,
  );

  assert.equal(formatted.message, "Something went wrong. Please try again.");
  assert.deepEqual(formatted.extensions, { code: "INTERNAL_SERVER_ERROR" });
  assert.equal(logged.length, 1);
});

// --- the constructors ----------------------------------------------------------

test("the constructors carry their code and message", () => {
  for (const [error, code] of [
    [notFound("Place not found"), "NOT_FOUND"],
    [badInput("name is required"), "BAD_USER_INPUT"],
    [forbidden("Not your account"), "FORBIDDEN"],
  ] as const) {
    assert.ok(error instanceof GraphQLError);
    assert.equal(error.extensions.code, code);
  }

  const anonymous = unauthenticated();
  assert.equal(anonymous.extensions.code, "UNAUTHENTICATED");
  assert.equal(anonymous.message, "Authentication required");

  const duplicate = appError("DUPLICATE_GOOGLE_PLACE_ID", "Taken", {
    existingPlaceId: "abc",
  });
  assert.deepEqual(duplicate.extensions, {
    code: "DUPLICATE_GOOGLE_PLACE_ID",
    existingPlaceId: "abc",
  });
});

// --- requireUser -----------------------------------------------------------------

const res = {} as Response;

test("requireUser returns the signed-in User", () => {
  const user = { id: "u1", email: "a@example.com" } as unknown as IUser;
  assert.equal(requireUser({ user, res }), user);
});

test("requireUser throws UNAUTHENTICATED for an anonymous context", () => {
  for (const context of [{ user: null, res }, { res }]) {
    assert.throws(
      () => requireUser(context),
      (error: unknown) =>
        error instanceof GraphQLError &&
        error.extensions.code === "UNAUTHENTICATED" &&
        error.message === "Authentication required" &&
        !("requiresLogin" in error.extensions),
    );
  }
});
