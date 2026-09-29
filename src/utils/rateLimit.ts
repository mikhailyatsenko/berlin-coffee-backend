import { appError } from "../graphql/errors.js";
import { normalizeEmail } from "./normalizeEmail.js";

/**
 * Fixed-window, in-memory rate limiting. Single process on 127.0.0.1, so a Map
 * is enough — there is nothing to share between instances, and counters reset
 * on deploy.
 *
 * A bucket is counted per key: the client IP (`clientIp`), or an address
 * (`emailKey`) where the limit follows the mailbox rather than the caller.
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

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Per IP, for a form that sends mail: the contact forms, reset, resend, registration, email change. */
const PER_IP_FORM: LimitRule[] = [
  { limit: 5, windowMs: HOUR },
  { limit: 20, windowMs: DAY },
];

export const RATE_LIMITS = {
  guestIdentity: [{ limit: 5, windowMs: HOUR }],
  guestReview: [
    { limit: 3, windowMs: HOUR },
    { limit: 10, windowMs: DAY },
  ],
  guestPhoto: [{ limit: 20, windowMs: HOUR }],
  // Users and Guests alike: an account costs nothing to make, so it is no
  // stronger a signal than a Guest identity.
  placeSuggestion: [{ limit: 3, windowMs: DAY }],
  // Each one mails the admin.
  contactForm: PER_IP_FORM,
  reportInaccuracy: PER_IP_FORM,
  // Every attempt, per IP.
  signIn: [
    { limit: 20, windowMs: 15 * MINUTE },
    { limit: 100, windowMs: DAY },
  ],
  // Failed attempts only, per email: password guessing against one User
  // from many IPs.
  signInFailure: [{ limit: 10, windowMs: HOUR }],
  // Per IP; each one can mail an address the caller typed.
  passwordReset: PER_IP_FORM,
  resendConfirmation: PER_IP_FORM,
  registerUser: PER_IP_FORM,
  emailChange: PER_IP_FORM,
  // Per recipient address, shared by every mail to a caller-supplied address;
  // counted inside the mail module.
  mailRecipient: [
    { limit: 3, windowMs: HOUR },
    { limit: 10, windowMs: DAY },
  ],
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
  appError("RATE_LIMITED", "Too many requests, please try again later", {
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  });

/** Every window of the bucket for this key, opening a fresh one where it expired. */
const windowsFor = (bucket: RateLimitBucket, key: string) => {
  const now = Date.now();
  const rules = RATE_LIMITS[bucket] as readonly LimitRule[];

  return rules.map((rule) => {
    const mapKey = `${bucket}:${rule.windowMs}:${key}`;
    let window = windows.get(mapKey);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + rule.windowMs };
      windows.set(mapKey, window);
    }

    return { window, exhausted: window.count >= rule.limit };
  });
};

/** Every window of the bucket, throwing if any of them is exhausted. */
const openWindowsFor = (bucket: RateLimitBucket, key: string): Window[] => {
  const all = windowsFor(bucket, key);
  const exhausted = all.find((w) => w.exhausted);
  if (exhausted) {
    throw rateLimitError(exhausted.window.resetAt - Date.now());
  }
  return all.map((w) => w.window);
};

/** Whether any rule of the bucket is exhausted, for a caller that must not throw. */
export function isRateLimited(bucket: RateLimitBucket, key: string): boolean {
  return windowsFor(bucket, key).some((w) => w.exhausted);
}

/**
 * Throws if any rule of the bucket is exhausted, without counting the request.
 *
 * Use this before slow work that may fail for reasons outside the caller's
 * control, then count the request with countRateLimit once you know whether it
 * deserves to be counted.
 */
export function checkRateLimit(bucket: RateLimitBucket, key: string): void {
  openWindowsFor(bucket, key);
}

/** Counts one request against every rule of the bucket, throwing if any is exhausted. */
export function countRateLimit(bucket: RateLimitBucket, key: string): void {
  for (const window of openWindowsFor(bucket, key)) {
    window.count += 1;
  }
}

/**
 * Counts one request against every rule of a bucket, throwing if any of them is
 * exhausted. Nothing is counted when the request is rejected.
 */
export function consumeRateLimit(bucket: RateLimitBucket, key: string): void {
  countRateLimit(bucket, key);
}

/**
 * Gives back one request counted by consumeRateLimit, for a request that
 * turned out not to deserve counting after it was counted.
 */
export function refundRateLimit(bucket: RateLimitBucket, key: string): void {
  const rules = RATE_LIMITS[bucket] as readonly LimitRule[];
  for (const rule of rules) {
    const window = windows.get(`${bucket}:${rule.windowMs}:${key}`);
    if (window && window.count > 0) window.count -= 1;
  }
}

/** Forgets every counter, like a deploy does; for tests that reuse an address or IP. */
export function resetRateLimits(): void {
  windows.clear();
}

/** The key for a bucket counted per address; the address is normalized here. */
export function emailKey(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

/** Express gives us the real client address because trust proxy is set. */
export function clientIp(req?: { ip?: string }): string {
  return req?.ip || "unknown";
}
