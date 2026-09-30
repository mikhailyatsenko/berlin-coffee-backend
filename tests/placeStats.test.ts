/**
 * The Average rating and Rating count of one Place, as every query and
 * mutation that returns them sees it — against a throwaway mongod.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { IUser } from "../src/models/User.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { callResolver, type TestContext } from "./support/callResolver.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { placesResolver } = await import(
  "../src/graphql/resolvers/allPlacesResolver/placesResolver.js"
);
const { filteredPlacesResolver } = await import(
  "../src/graphql/resolvers/filteredPlacesResolver/filteredPlacesResolver.js"
);
const { placeResolver } = await import(
  "../src/graphql/resolvers/placeResolver/placeResolver.js"
);
const { favoritePlacesResolver } = await import(
  "../src/graphql/resolvers/favoritePlacesResolver/favoritePlacesResolver.js"
);
const { addRatingResolver } = await import(
  "../src/graphql/resolvers/addRatingResolver/addRatingResolver.js"
);
const { deleteReviewResolver } = await import(
  "../src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.js"
);
const { userReviewActivityResolver } = await import(
  "../src/graphql/resolvers/userReviewActivityResolver/userReviewActivityResolver.js"
);
const { cache } = await import("../src/utils/cache.js");

useThrowawayMongod();

beforeEach(async () => {
  await Place.deleteMany({});
  await Interaction.deleteMany({});
});

const userId = new mongoose.Types.ObjectId();
const asUser: TestContext = {
  user: { id: userId.toString(), _id: userId } as Partial<IUser>,
};

/**
 * A Place with Ratings 5, 4 and 4 from others, a Review with text and no
 * Rating, an empty document left by `deleteAll`, and the User's Favorite.
 */
async function aRatedPlace() {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name: "Rated", address: "Somewhere 1, Berlin" },
  });
  const placeId = place._id;
  // `place` reads its images from the cache before ImageKit
  cache.set(`images:${placeId}`, [], 60_000);
  await Interaction.create([
    { placeId, guestId: crypto.randomUUID(), rating: 5 },
    { placeId, guestId: crypto.randomUUID(), rating: 4 },
    { placeId, isGoogleReview: true, rating: 4 },
    { placeId, guestId: crypto.randomUUID(), reviewText: "no stars" },
    { placeId, guestId: crypto.randomUUID() },
    { placeId, userId, isFavorite: true },
  ]);
  return placeId.toString();
}

/** What each query returns for the Place, as `[query, averageRating, ratingCount?]`. */
async function statsFromQueries(placeId: string) {
  const { places } = await callResolver(placesResolver, { offset: 0 }, asUser);
  const listed = places.find((p) => p.id === placeId)!.properties;

  const filtered = (
    await callResolver(filteredPlacesResolver, {}, asUser)
  ).places.find((p) => p.id === placeId)!.properties;

  const single = (await callResolver(placeResolver, { placeId }, asUser))
    .properties;

  const favorite = (
    await callResolver(favoritePlacesResolver, {}, asUser)
  ).find((p) => p.id === placeId)!;

  return [
    ["places", listed.averageRating, listed.ratingCount],
    ["filteredPlaces", filtered.averageRating, filtered.ratingCount],
    ["place", single.averageRating, single.ratingCount],
    // FavoritePlace has no ratingCount
    ["favoritePlaces", favorite.averageRating],
  ] as const;
}

/** Asserts every query returns these stats for the Place. */
async function assertQueriesReturn(
  placeId: string,
  averageRating: number,
  ratingCount: number,
) {
  for (const [query, ...got] of await statsFromQueries(placeId)) {
    const expected = [averageRating, ratingCount].slice(0, got.length);
    assert.deepEqual([query, ...got], [query, ...expected]);
  }
}

test("every query and addRating return the same Average rating and Rating count", async () => {
  const placeId = await aRatedPlace();

  // Ratings 5, 4, 4, 4: 4.25, which rounds half up
  const added = await callResolver(
    addRatingResolver,
    { placeId, rating: 4 },
    asUser,
  );

  assert.equal(added.averageRating, 4.3);
  assert.equal(added.ratingCount, 4);
  await assertQueriesReturn(placeId, 4.3, 4);
});

test("deleteReview returns the Average rating as a number, the same the queries return", async () => {
  const placeId = await aRatedPlace();
  await callResolver(addRatingResolver, { placeId, rating: 1 }, asUser);
  const own = await Interaction.findOne({ userId, placeId });

  // Ratings 5, 4, 4 once the User's 1 is gone: 4.333…
  const result = await callResolver(
    deleteReviewResolver,
    { reviewId: own!.id, deleteOptions: "deleteRating" },
    asUser,
  );

  assert.equal(typeof result.averageRating, "number");
  assert.equal(result.averageRating, 4.3);
  assert.equal(result.ratingCount, 3);
  await assertQueriesReturn(placeId, 4.3, 3);
});

test("userReviewActivity returns the Place's Average rating as a number", async () => {
  const placeId = await aRatedPlace();
  await callResolver(addRatingResolver, { placeId, rating: 4 }, asUser);

  const [activity] = await callResolver(userReviewActivityResolver, {}, asUser);

  assert.equal(activity.placeId, placeId);
  assert.equal(activity.averageRating, 4.3);
});

test("a Place without Ratings has an Average rating of 0", async () => {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name: "Unrated", address: "Somewhere 2, Berlin" },
  });
  const placeId = place._id.toString();
  cache.set(`images:${placeId}`, [], 60_000);
  await Interaction.create({ placeId, userId, isFavorite: true, reviewText: "hm" });

  await assertQueriesReturn(placeId, 0, 0);
});
