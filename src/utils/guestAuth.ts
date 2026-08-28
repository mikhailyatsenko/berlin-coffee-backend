import crypto from "crypto";
import { Request } from "express";
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

export const GUEST_ID_HEADER = "x-guest-id";
export const GUEST_SECRET_HEADER = "x-guest-secret";

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

type GuestLookup =
  | { ok: true; identity: IGuestIdentity }
  | { ok: false; reason: string };

/**
 * Verifies the credential pair without deciding what to do about the result.
 * Says nothing about claimed identities on purpose: whether that disqualifies
 * an identity depends on the caller.
 */
async function lookupGuestIdentity(
  guestId?: string | null,
  guestSecret?: string | null,
): Promise<GuestLookup> {
  if (!guestId || !guestSecret) {
    return { ok: false, reason: "missing_credentials" };
  }

  const identity = await GuestIdentity.findOne({ guestId });

  if (!identity) {
    return { ok: false, reason: "not_found" };
  }

  const expected = Buffer.from(identity.secretHash, "hex");
  const actual = Buffer.from(hashSecret(guestSecret), "hex");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return { ok: false, reason: "secret_mismatch" };
  }

  return { ok: true, identity };
}

async function touchLastUsed(identity: IGuestIdentity): Promise<void> {
  if (Date.now() - identity.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    identity.lastUsedAt = new Date();
    await identity.save();
  }
}

/**
 * What a request carries about its guest, resolved once and reused by every
 * resolver in the operation.
 *
 * "invalid" stays distinct from "absent" on purpose: a client whose stored
 * credentials stopped working has to clear them and mint a new identity, which
 * is a different instruction from "sign in".
 */
export type GuestContext =
  | { status: "absent" }
  | { status: "valid"; identity: IGuestIdentity }
  | { status: "invalid"; reason: string };

const headerValue = (req: Request | undefined, name: string) => {
  const raw = req?.headers?.[name];
  return Array.isArray(raw) ? raw[0] : raw;
};

/**
 * Resolves the guest identity attached to a request. Never throws: this runs
 * for every operation including plain reads, and one stale credential in
 * somebody's localStorage must not turn the whole map into an error page.
 */
export async function guestContextFromRequest(
  req?: Request,
): Promise<GuestContext> {
  const guestId = headerValue(req, GUEST_ID_HEADER);
  const guestSecret = headerValue(req, GUEST_SECRET_HEADER);

  if (!guestId || !guestSecret) {
    return { status: "absent" };
  }

  const lookup = await lookupGuestIdentity(guestId, guestSecret);

  if (!lookup.ok) {
    return { status: "invalid", reason: lookup.reason };
  }

  if (lookup.identity.claimedBy) {
    return { status: "invalid", reason: "already_claimed" };
  }

  await touchLastUsed(lookup.identity);

  return { status: "valid", identity: lookup.identity };
}

/**
 * Resolves a guest identity from credentials passed as mutation arguments.
 * Throws unless the pair matches an identity that has not already been claimed
 * by a registered account.
 */
export async function requireGuestIdentity(
  guestId?: string | null,
  guestSecret?: string | null,
): Promise<IGuestIdentity> {
  const lookup = await lookupGuestIdentity(guestId, guestSecret);

  if (!lookup.ok) {
    throw invalidGuestError(lookup.reason);
  }

  if (lookup.identity.claimedBy) {
    throw invalidGuestError("already_claimed");
  }

  await touchLastUsed(lookup.identity);

  return lookup.identity;
}

/**
 * Same check as requireGuestIdentity, but allows an identity that was already
 * claimed — claimGuestReviews needs to stay idempotent when the client retries.
 */
export async function resolveGuestIdentityForClaim(
  guestId?: string | null,
  guestSecret?: string | null,
): Promise<IGuestIdentity> {
  const lookup = await lookupGuestIdentity(guestId, guestSecret);

  if (!lookup.ok) {
    throw invalidGuestError(lookup.reason);
  }

  return lookup.identity;
}
