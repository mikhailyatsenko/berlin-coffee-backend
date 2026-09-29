import { GraphQLError } from "graphql";
import { formatError } from "../../src/graphql/formatError.js";

/**
 * The `extensions.code` the client would see for an error a resolver threw:
 * an authored error keeps its code, anything else is masked by formatError as
 * INTERNAL_SERVER_ERROR (and logged, as in production).
 */
export function clientCode(error: unknown): unknown {
  const formatted =
    error instanceof GraphQLError ? error.toJSON() : { message: String(error) };
  return formatError(formatted, error).extensions?.code;
}
