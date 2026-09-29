import type { Request } from "express";
import type { UpdateQuery } from "mongoose";
import Interaction, { type IInteraction } from "../models/Interaction.js";
import { clientIp, consumeRateLimit, refundRateLimit } from "./rateLimit.js";
import type { ReviewActor } from "./reviewActor.js";

/**
 * Writes the actor's Review of a Place (their Interaction document) in one
 * atomic upsert, so two concurrent first writes (a double tap, a Rating and a
 * Characteristic sent together) merge into one Review instead of failing on
 * the unique index.
 *
 * A Guest's first write costs one guestReview quota; revising their own Review
 * costs nothing, the same as for a User. A Guest is first tried against an
 * existing Review without upserting, so an exhausted Guest can still revise.
 * Otherwise the quota is taken before the upsert, so a refused first write
 * stores nothing, and given back if the upsert result shows a concurrent call
 * created the Review first.
 */
export async function upsertInteraction(
  actor: ReviewActor,
  placeId: string,
  update: UpdateQuery<IInteraction>,
  req: Request | undefined,
) {
  const filter = { ...actor.owner, placeId };

  if (actor.isGuest) {
    const existing = await Interaction.findOneAndUpdate(filter, update, {
      new: true,
      lean: true,
      runValidators: true,
    });
    if (existing) return existing;
    consumeRateLimit("guestReview", clientIp(req));
  }

  let result;
  try {
    result = await retryOnDuplicateKey(() =>
      Interaction.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        lean: true,
        runValidators: true,
        includeResultMetadata: true,
      }),
    );
  } catch (error) {
    if (actor.isGuest) refundRateLimit("guestReview", clientIp(req));
    throw error;
  }

  if (actor.isGuest && result.lastErrorObject?.updatedExisting) {
    refundRateLimit("guestReview", clientIp(req));
  }

  // An upsert with `new: true` always returns the document it wrote.
  return result.value!;
}

type Characteristic = keyof IInteraction["characteristics"];

/** The on/off parts of a Review: a Favorite and each Characteristic. */
export type ToggleField = "isFavorite" | `characteristics.${Characteristic}`;

/**
 * Flips an on/off part of the actor's Review in place, creating the Review
 * first if there is none. The flip is one update on the server, so two
 * concurrent toggles cancel out rather than one overwriting the other.
 */
export async function toggleInteractionField(
  actor: ReviewActor,
  placeId: string,
  field: ToggleField,
  req: Request | undefined,
) {
  // Creates the Review with the schema defaults (the field off) if it is
  // missing, and changes nothing otherwise.
  await upsertInteraction(
    actor,
    placeId,
    { $setOnInsert: { date: new Date() } },
    req,
  );

  // An update pipeline, so the new value is computed from the stored one.
  await Interaction.updateOne({ ...actor.owner, placeId }, [
    { $set: { [field]: { $not: [{ $eq: [`$${field}`, true] }] } } },
  ]);
}

/**
 * The server retries an upsert that loses an insert race on a unique index,
 * but not in every case; one retry of our own finds the winner's document.
 */
async function retryOnDuplicateKey<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if ((error as { code?: unknown }).code !== 11000) throw error;
    return write();
  }
}
