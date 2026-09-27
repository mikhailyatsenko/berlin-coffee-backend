import dotenv from "dotenv";

dotenv.config();

export const {
  MONGO_URI,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  JWT_SECRET,
  MAILERSEND_API_KEY,
  NODE_ENV,
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_URL_ENDPOINT,
  RECAPTCHA_V3_SECRET,
  PLACE_SUGGESTION_REVIEW_SECRET,
  GOOGLE_PLACES_API_KEY,
} = process.env;

const requiredEnvVars = [
  "MONGO_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MAILERSEND_API_KEY",
  "NODE_ENV",
  "IMAGEKIT_PUBLIC_KEY",
  "IMAGEKIT_PRIVATE_KEY",
  "IMAGEKIT_URL_ENDPOINT",
  "RECAPTCHA_V3_SECRET",
  "PLACE_SUGGESTION_REVIEW_SECRET",
  "GOOGLE_PLACES_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Optional, unlike the ones above: the defaults are what production runs with,
// and tests shorten them so that timeouts play out in milliseconds.

/** How long a Photo upload may take before it counts as failed. */
export const REVIEW_IMAGE_UPLOAD_TIMEOUT_MS =
  Number(process.env.REVIEW_IMAGE_UPLOAD_TIMEOUT_MS) || 30_000;

/** The longest a timed-out Photo upload keeps the lease while ImageKit may still store its file. */
export const REVIEW_IMAGE_ABANDONED_LEASE_MS =
  Number(process.env.REVIEW_IMAGE_ABANDONED_LEASE_MS) || 10 * 60_000;
