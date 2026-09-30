import { GraphQLError } from "graphql";

/**
 * Every code a resolver may put on an error. The base codes cover the common
 * cases; the domain codes exist only because the client branches on them, so
 * a new one belongs here only when the frontend needs to tell it apart.
 *
 * An error built here is *expected*: its message (English, shown to the user)
 * and extensions reach the client as they are. Anything else a resolver
 * throws is masked by `formatError` as INTERNAL_SERVER_ERROR.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_USER_INPUT"
  | "INTERNAL_SERVER_ERROR"
  | "RATE_LIMITED"
  | "CAPTCHA_FAILED"
  | "GUEST_IDENTITY_INVALID"
  | "TOKEN_EXPIRED"
  | "INVALID_TOKEN"
  | "EMAIL_ALREADY_CONFIRMED"
  | "EMAIL_TAKEN"
  | "IMAGE_LIMIT_REACHED"
  | "UPLOAD_IN_PROGRESS"
  | "INVALID_REVIEW_LINK"
  | "DUPLICATE_GOOGLE_PLACE_ID";

/** Extra fields the client may read next to `code`, e.g. `retryAfterSeconds`. */
type ErrorDetails = Record<string, unknown> & { code?: never };

export const appError = (
  code: ErrorCode,
  message: string,
  details?: ErrorDetails,
) => new GraphQLError(message, { extensions: { code, ...details } });

export const unauthenticated = () =>
  appError("UNAUTHENTICATED", "Authentication required");

export const forbidden = (message: string) => appError("FORBIDDEN", message);

export const notFound = (message: string) => appError("NOT_FOUND", message);

export const badInput = (message: string) =>
  appError("BAD_USER_INPUT", message);
