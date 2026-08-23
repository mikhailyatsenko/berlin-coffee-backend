import { Request } from "express";
import { GraphQLError } from "graphql";
import { createGuestIdentity } from "../../../utils/guestAuth.js";
import {
  checkRateLimit,
  clientIp,
  countRateLimit,
} from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";

/**
 * The single point where a guest captcha is verified. Everything a guest does
 * afterwards is authenticated with the issued secret, which is why the volume
 * caps in rateLimit.ts matter more than the captcha itself: clearing
 * localStorage and asking for a new identity is cheap.
 */
export async function createGuestIdentityResolver(
  _: never,
  { captchaToken }: { captchaToken?: string | null },
  { req }: { req?: Request },
) {
  const ip = clientIp(req);

  // Checked before the captcha call, counted after it: verification fails
  // closed, so an outage at Google must not burn a visitor's hourly quota and
  // lock them out once it is over. A captcha that actually rejects them still
  // counts, which is what keeps identity minting from being brute-forced.
  checkRateLimit("guestIdentity", ip);

  try {
    await verifyRecaptcha(captchaToken ?? "", "create_guest_identity", ip);
  } catch (error) {
    const reason =
      error instanceof GraphQLError ? error.extensions?.reason : undefined;

    if (reason !== "verification_unavailable") {
      countRateLimit("guestIdentity", ip);
    }

    throw error;
  }

  countRateLimit("guestIdentity", ip);

  return createGuestIdentity();
}
