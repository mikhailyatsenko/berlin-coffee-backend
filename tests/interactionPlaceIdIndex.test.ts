/**
 * The index on `interactions.placeId`, which every lookup of a Place's
 * Reviews goes through, and the migration that creates it where autoIndex is
 * off (production) — against a throwaway mongod.
 *
 * Run: npm test
 */
import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: Interaction } = await import("../src/models/Interaction.js");
const { ensurePlaceIdIndex, PLACE_ID_INDEX } = await import(
  "../src/scripts/interactionPlaceIdIndex.js"
);

useThrowawayMongod();

before(async () => {
  // Let autoIndex finish, so it can't recreate an index a test dropped.
  await Interaction.init();
});

// Every test starts from the indexes the schema declares.
beforeEach(async () => {
  await Interaction.syncIndexes();
});

const hasPlaceIdIndex = (indexes: { key: object; name?: string }[]) =>
  indexes.some(
    (index) =>
      index.name === PLACE_ID_INDEX.name &&
      JSON.stringify(index.key) === JSON.stringify(PLACE_ID_INDEX.key),
  );

test("the schema declares the index the migration creates", () => {
  assert.ok(
    Interaction.schema
      .indexes()
      .some(
        ([key]) => JSON.stringify(key) === JSON.stringify(PLACE_ID_INDEX.key),
      ),
  );
});

test("the migration creates the placeId index, and a second run changes nothing", async () => {
  await Interaction.collection.dropIndexes();
  assert.equal(hasPlaceIdIndex(await Interaction.collection.indexes()), false);

  await ensurePlaceIdIndex(mongoose.connection);
  const afterFirst = await Interaction.collection.indexes();
  assert.equal(hasPlaceIdIndex(afterFirst), true);

  await ensurePlaceIdIndex(mongoose.connection);
  assert.deepEqual(await Interaction.collection.indexes(), afterFirst);
});

test("the migration creates the collection's index even before any Review exists", async () => {
  await Interaction.collection.drop();

  await ensurePlaceIdIndex(mongoose.connection);

  assert.equal(hasPlaceIdIndex(await Interaction.collection.indexes()), true);
});

test("finding a Place's Reviews uses the index, not a collection scan", async () => {
  const placeId = new mongoose.Types.ObjectId();
  await Interaction.create([
    { placeId, guestId: crypto.randomUUID(), rating: 4 },
    { placeId: new mongoose.Types.ObjectId(), guestId: crypto.randomUUID() },
  ]);

  const plan = JSON.stringify(
    await Interaction.find({ placeId }).explain("queryPlanner"),
  );

  assert.match(plan, /"IXSCAN"/);
  assert.match(plan, new RegExp(`"indexName":"${PLACE_ID_INDEX.name}"`));
  assert.doesNotMatch(plan, /"COLLSCAN"/);
});
