// import fetch from "node-fetch";

import { env } from "./env.utils.js";

/**
 * Verifies a Google reCAPTCHA v3 token.
 * @param token The token received from the client.
 * @param remoteIp (optional) The user's IP address for extra security.
 * @throws Error if verification fails or score is too low.
 */
export async function verifyRecaptcha(
  token: string,
  remoteIp?: string,
): Promise<void> {
  const secret = env.isDev
    ? process.env.RE_CAPTCHA_KEY_DEV
    : process.env.RE_CAPTCHA_KEY_PROD;

  if (!secret) {
    throw new Error(
      "RECAPTCHA_SECRET_KEY is not defined in environment variables",
    );
  }

  console.log(secret);

  const params = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    params.append("remoteip", remoteIp);
  }
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error("Failed to verify reCAPTCHA: network error");
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(
      "Failed to verify reCAPTCHA: " +
        (data["error-codes"]?.join(", ") || "unknown error"),
    );
  }
  // Optionally, check score for v3 (e.g., >= 0.5 is usually considered human)
  if (typeof data.score === "number" && data.score < 0.5) {
    throw new Error("reCAPTCHA score too low: " + data.score);
  }
}
