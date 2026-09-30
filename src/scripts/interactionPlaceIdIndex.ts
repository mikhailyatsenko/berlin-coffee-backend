import type mongoose from "mongoose";

/**
 * The index behind every lookup of a Place's Reviews (`placeStats`, the list
 * queries, `placeReviews`). Declared on the Interaction schema too; keep the
 * two in sync.
 */
export const PLACE_ID_INDEX = { key: { placeId: 1 }, name: "placeId_1" } as const;

/**
 * Creates the placeId index on `interactions`. createIndex is a no-op when an
 * identical index exists and creates the collection when it doesn't, so this
 * is safe to run any number of times.
 */
export async function ensurePlaceIdIndex(connection: mongoose.Connection) {
  await connection
    .collection("interactions")
    .createIndex(PLACE_ID_INDEX.key, { name: PLACE_ID_INDEX.name });
}
