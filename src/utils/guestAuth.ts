import crypto from "crypto";
import { GraphQLError } from "graphql";
import GuestIdentity, { IGuestIdentity } from "../models/GuestIdentity.js";

/**
 * Guest identities are the credential that replaces a session for
 * unauthenticated users. The captcha is checked once, when the identity is
 * issued; everything afterwards is authenticated with the secret.
 *
 * The secret is 32 random bytes, so sha256 is the right hash here — bcrypt
 * exists to slow down guessing of low-entropy passwords and would only add
 * latency to every guest request.
 */

const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;

const hashSecret = (secret: string) =>
  crypto.createHash("sha256").update(secret).digest("hex");

const invalidGuestError = (reason: string) =>
  new GraphQLError("Guest session is not valid", {
    extensions: { code: "GUEST_IDENTITY_INVALID", reason },
  });

export async function createGuestIdentity(): Promise<{
  guestId: string;
  guestSecret: string;
}> {
  const guestId = crypto.randomUUID();
  const guestSecret = crypto.randomBytes(32).toString("base64url");

  await GuestIdentity.create({
    guestId,
    secretHash: hashSecret(guestSecret),
  });

  // The raw secret is returned exactly once and never stored.
  return { guestId, guestSecret };
}

/**
 * Resolves a guest identity from the credentials the client keeps in
 * localStorage. Throws unless the pair matches an identity that has not already
 * been claimed by a registered account.
 */
export async function requireGuestIdentity(
  guestId?: string | null,
  guestSecret?: string | null,
): Promise<IGuestIdentity> {
  if (!guestId || !guestSecret) {
    throw invalidGuestError("missing_credentials");
  }

  const identity = await GuestIdentity.findOne({ guestId });

  if (!identity) {
    throw invalidGuestError("not_found");
  }

  const expected = Buffer.from(identity.secretHash, "hex");
  const actual = Buffer.from(hashSecret(guestSecret), "hex");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw invalidGuestError("secret_mismatch");
  }

  if (identity.claimedBy) {
    throw invalidGuestError("already_claimed");
  }

  if (Date.now() - identity.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    identity.lastUsedAt = new Date();
    await identity.save();
  }

  return identity;
}

/**
 * Same check as requireGuestIdentity, but allows an identity that was already
 * claimed — claimGuestReviews needs to stay idempotent when the client retries.
 */
export async function resolveGuestIdentityForClaim(
  guestId?: string | null,
  guestSecret?: string | null,
): Promise<IGuestIdentity> {
  if (!guestId || !guestSecret) {
    throw invalidGuestError("missing_credentials");
  }

  const identity = await GuestIdentity.findOne({ guestId });

  if (!identity) {
    throw invalidGuestError("not_found");
  }

  const expected = Buffer.from(identity.secretHash, "hex");
  const actual = Buffer.from(hashSecret(guestSecret), "hex");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw invalidGuestError("secret_mismatch");
  }

  return identity;
}
