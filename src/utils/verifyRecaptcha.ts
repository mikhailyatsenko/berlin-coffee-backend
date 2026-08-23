import { GraphQLError } from "graphql";
import { RECAPTCHA_V3_SECRET } from "../config/env.js";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const REQUEST_TIMEOUT_MS = 3000;
const MIN_SCORE = 0.5;

/** Must match the action names the frontend passes to grecaptcha.execute. */
export type RecaptchaAction =
  | "create_guest_identity"
  | "register_user"
  | "contact_form"
  | "report_inaccuracy";

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

const captchaError = (message: string, reason: string) =>
  new GraphQLError(message, {
    extensions: { code: "CAPTCHA_FAILED", reason },
  });

/**
 * Verifies a Google reCAPTCHA v3 token.
 *
 * Fails closed: a timeout, a network error or an unreachable Google rejects the
 * request instead of waving it through.
 *
 * @param token The token received from the client.
 * @param action The action the token was minted for. Verified against the
 *   response — without this check a token obtained on any other form of the
 *   site would be accepted here.
 * @param remoteIp (optional) The user's IP address for extra security.
 */
export async function verifyRecaptcha(
  token: string,
  action: RecaptchaAction,
  remoteIp?: string,
): Promise<void> {
  if (!RECAPTCHA_V3_SECRET) {
    throw captchaError(
      "Captcha verification is unavailable",
      "secret_not_configured",
    );
  }

  if (!token) {
    throw captchaError("Captcha token is missing", "missing_token");
  }

  const params = new URLSearchParams({
    secret: RECAPTCHA_V3_SECRET,
    response: token,
  });
  if (remoteIp) {
    params.append("remoteip", remoteIp);
  }

  let data: SiteVerifyResponse;

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`siteverify responded with ${res.status}`);
    }

    data = (await res.json()) as SiteVerifyResponse;
  } catch (error) {
    console.error("reCAPTCHA verification unreachable:", error);
    throw captchaError(
      "Could not verify captcha, please try again",
      "verification_unavailable",
    );
  }

  if (!data.success) {
    console.warn("reCAPTCHA rejected:", data["error-codes"]);
    throw captchaError("Captcha verification failed", "rejected");
  }

  if (data.action !== action) {
    console.warn(
      `reCAPTCHA action mismatch: expected ${action}, got ${data.action}`,
    );
    throw captchaError("Captcha verification failed", "action_mismatch");
  }

  if (typeof data.score === "number" && data.score < MIN_SCORE) {
    console.warn(`reCAPTCHA score too low for ${action}: ${data.score}`);
    throw captchaError("Captcha verification failed", "low_score");
  }
}
