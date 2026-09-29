import { GraphQLError, type GraphQLFormattedError } from "graphql";
import { unwrapResolverError } from "@apollo/server/errors";
import type { ErrorCode } from "./errors.js";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const MASKED_CODE: ErrorCode = "INTERNAL_SERVER_ERROR";

/**
 * Whether the error was thrown on purpose. A resolver's throw is unwrapped
 * from graphql-js's located wrapper first. Apollo also wraps a raw error
 * thrown outside any resolver (the context function's "Context creation
 * failed: …") in a GraphQLError with no code of its own; that one is not
 * expected either. Apollo's validation and coercion errors carry their code,
 * so they pass even when a scalar threw a plain error underneath.
 */
function isExpected(error: unknown): boolean {
  const cause = unwrapResolverError(error);
  if (!(cause instanceof GraphQLError)) return false;
  const wrapsRawError =
    cause.originalError !== undefined &&
    !(cause.originalError instanceof GraphQLError);
  return !(wrapsRawError && cause.extensions.code === undefined);
}

/**
 * The one place that decides what the client sees (see `errors.ts`).
 *
 * Expected: the error was thrown as a GraphQLError (authored ones, plus
 * Apollo's parse, validation and coercion errors). Its message and every
 * extension except `stacktrace` pass through, unlogged.
 *
 * Unexpected: anything else (Mongo, ImageKit, bcrypt, MailerSend, a missing
 * env). The client gets INTERNAL_SERVER_ERROR and a generic message; the error
 * is logged here, once, with its stack and path. The same in every
 * environment, so development shows what production will.
 */
export function formatError(
  formattedError: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  if (isExpected(error)) {
    const extensions = { ...formattedError.extensions };
    delete extensions.stacktrace;
    return { ...formattedError, extensions };
  }

  const path = formattedError.path?.join(".") ?? "(no path)";
  console.error(`Unexpected error at ${path}:`, unwrapResolverError(error));

  return {
    message: GENERIC_MESSAGE,
    locations: formattedError.locations,
    path: formattedError.path,
    extensions: { code: MASKED_CODE },
  };
}
