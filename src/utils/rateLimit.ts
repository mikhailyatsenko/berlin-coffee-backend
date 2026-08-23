import { GraphQLError } from "graphql";

/**
 * Fixed-window, in-memory rate limiting. Single process on 127.0.0.1, so a Map
 * is enough — there is nothing to share between instances.
 *
 * Captcha only proves that a human requested the guest identity once, so these
 * counters are the only thing capping how much a guest can actually submit.
 */

interface Window {
  count: number;
  resetAt: number;
}

interface LimitRule {
  limit: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const RATE_LIMITS = {
  guestIdentity: [{ limit: 5, windowMs: HOUR }],
  guestReview: [
    { limit: 3, windowMs: HOUR },
    { limit: 10, windowMs: DAY },
  ],
  guestPhoto: [{ limit: 20, windowMs: HOUR }],
} satisfies Record<string, LimitRule[]>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

const windows = new Map<string, Window>();

// Windows are short-lived; sweeping hourly keeps the map from growing with the
// long tail of one-off IPs.
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of windows.entries()) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}, HOUR).unref();

const rateLimitError = (retryAfterMs: number) =>
  new GraphQLError("Too many requests, please try again later", {
    extensions: {
      code: "RATE_LIMITED",
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    },
  });

const windowsFor = (bucket: RateLimitBucket, ip: string): Window[] => {
  const now = Date.now();
  const rules = RATE_LIMITS[bucket] as readonly LimitRule[];

  return rules.map((rule) => {
    const key = `${bucket}:${rule.windowMs}:${ip}`;
    let window = windows.get(key);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + rule.windowMs };
      windows.set(key, window);
    }

    if (window.count >= rule.limit) {
      throw rateLimitError(window.resetAt - now);
    }

    return window;
  });
};

/**
 * Throws if any rule of the bucket is exhausted, without counting the request.
 *
 * Use this before slow work that may fail for reasons outside the caller's
 * control, then count the request with countRateLimit once you know whether it
 * deserves to be counted.
 */
export function checkRateLimit(bucket: RateLimitBucket, ip: string): void {
  windowsFor(bucket, ip);
}

/** Counts one request against every rule of the bucket. */
export function countRateLimit(bucket: RateLimitBucket, ip: string): void {
  for (const window of windowsFor(bucket, ip)) {
    window.count += 1;
  }
}

/**
 * Counts one request against every rule of a bucket, throwing if any of them is
 * exhausted. Nothing is counted when the request is rejected.
 */
export function consumeRateLimit(bucket: RateLimitBucket, ip: string): void {
  countRateLimit(bucket, ip);
}

/** Express gives us the real client address because trust proxy is set. */
export function clientIp(req?: { ip?: string }): string {
  return req?.ip || "unknown";
}
