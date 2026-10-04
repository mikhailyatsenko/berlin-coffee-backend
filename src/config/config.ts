/**
 * The one place that reads process.env. Built and validated once, on import:
 * a missing variable or an unknown NODE_ENV stops the process before it serves
 * anything, so it can never run half in one mode and half in the other.
 */
import dotenv from "dotenv";

dotenv.config();

const NODE_ENVS = ["production", "development", "test"] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

const REQUIRED = [
  "MONGO_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MAILERSEND_API_KEY",
  "IMAGEKIT_PUBLIC_KEY",
  "IMAGEKIT_PRIVATE_KEY",
  "IMAGEKIT_URL_ENDPOINT",
  "RECAPTCHA_V3_SECRET",
  "PLACE_SUGGESTION_REVIEW_SECRET",
  "GOOGLE_PLACES_API_KEY",
  "ADMIN_EMAIL",
] as const;

type RawEnv = Record<string, string | undefined>;

const parseNodeEnv = (value: string | undefined): NodeEnv => {
  if ((NODE_ENVS as readonly string[]).includes(value ?? "")) {
    return value as NodeEnv;
  }
  const got = value ? `got "${value}"` : "it is not set";
  throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(", ")}; ${got}`);
};

export const buildConfig = (raw: RawEnv) => {
  const nodeEnv = parseNodeEnv(raw.NODE_ENV);

  const missing = REQUIRED.filter((name) => !raw[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  const env = raw as Record<(typeof REQUIRED)[number], string>;

  // `test` behaves like development.
  const isProduction = nodeEnv === "production";

  // Shared by setting and clearing the auth cookies: a browser only clears a
  // cookie whose domain and path match, and only accepts a cross-site
  // Set-Cookie that is SameSite=None; Secure.
  const authCookie = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    domain: isProduction ? "api.3welle.com" : "localhost",
    path: "/",
  };

  return {
    nodeEnv,
    isProduction,

    /** The base of links in emails and the Google OAuth redirect. */
    frontendUrl: isProduction ? "https://3welle.com" : "http://localhost:5173",
    /**
     * Origins allowed to call the API: the site in production, and localhost
     * on any port locally, so a second dev server or a preview build works too.
     */
    corsOrigin: isProduction ? "https://3welle.com" : /^http:\/\/localhost:\d+$/,

    authCookie,
    accessTokenCookie: { ...authCookie, maxAge: 15 * 60 * 1000 },
    refreshTokenCookie: { ...authCookie, maxAge: 7 * 24 * 60 * 60 * 1000 },

    mongoUri: env.MONGO_URI,
    jwtSecret: env.JWT_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
    mailerSendApiKey: env.MAILERSEND_API_KEY,
    /** Where contact messages, inaccuracy reports and Place suggestions go. */
    adminEmail: env.ADMIN_EMAIL,
    recaptchaV3Secret: env.RECAPTCHA_V3_SECRET,
    placeSuggestionReviewSecret: env.PLACE_SUGGESTION_REVIEW_SECRET,
    imagekit: {
      publicKey: env.IMAGEKIT_PUBLIC_KEY,
      privateKey: env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
    },

    // Optional, unlike the ones above: the defaults are what production runs
    // with, and tests shorten them so that timeouts play out in milliseconds.

    /** How long a Photo or Place photo upload may take before it counts as failed. */
    photoUploadTimeoutMs: Number(raw.REVIEW_IMAGE_UPLOAD_TIMEOUT_MS) || 30_000,
    /** The longest a timed-out Photo upload keeps the lease while ImageKit may still store its file. */
    reviewImageAbandonedLeaseMs:
      Number(raw.REVIEW_IMAGE_ABANDONED_LEASE_MS) || 10 * 60_000,
  };
};

export type Config = ReturnType<typeof buildConfig>;

export const config: Config = buildConfig(process.env);
