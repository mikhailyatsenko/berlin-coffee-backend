/**
 * The schema promises only fields the resolvers return: queries run through a
 * real ApolloServer with the server's schema, resolvers and formatError, so a
 * field declared non-null but never filled would surface as an error.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ApolloServer } from "@apollo/server";
import type { Context } from "../src/graphql/context.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { typeDefs, resolvers } = await import("../src/graphql/index.js");
const { formatError } = await import("../src/graphql/formatError.js");
const { cache } = await import("../src/utils/cache.js");

useThrowawayMongod();

const server = new ApolloServer({ typeDefs, resolvers, formatError });

beforeEach(async () => {
  await Place.deleteMany({});
  await Interaction.deleteMany({});
});

async function run(query: string, variables: Record<string, unknown> = {}) {
  const response = await server.executeOperation(
    { query, variables },
    // An anonymous caller: none of these queries reads `res`.
    { contextValue: {} as Context },
  );
  assert.equal(response.body.kind, "single");
  // graphql-js builds results on null prototypes; compare them as the client would.
  return JSON.parse(JSON.stringify(response.body.singleResult));
}

async function seedPlace() {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name: "Cafe", address: "Somewhere 1, Berlin" },
  });
  // Keep `place` off ImageKit: its image list comes from the cache.
  cache.set(`images:${place._id.toString()}`, [], 60_000);
  return place._id.toString();
}

test("place fills characteristicCounts", async () => {
  const placeId = await seedPlace();
  await Interaction.create({
    placeId,
    guestId: "guest-1",
    rating: 5,
    characteristics: { freeWifi: true },
  });

  const { data, errors } = await run(
    `query ($placeId: ID!) {
      place(placeId: $placeId) {
        properties { characteristicCounts { freeWifi { count } petFriendly { count } } }
      }
    }`,
    { placeId },
  );

  assert.equal(errors, undefined);
  assert.deepEqual(data, {
    place: {
      properties: {
        characteristicCounts: {
          freeWifi: { count: 1 },
          petFriendly: { count: 0 },
        },
      },
    },
  });
});

test("places returns null characteristicCounts without an error", async () => {
  await seedPlace();

  const { data, errors } = await run(
    `{ places { places { properties { name characteristicCounts { freeWifi { count } } } } } }`,
  );

  assert.equal(errors, undefined);
  assert.deepEqual(data, {
    places: {
      places: [{ properties: { name: "Cafe", characteristicCounts: null } }],
    },
  });
});

test("placeReviews fills placeId on every Review", async () => {
  const placeId = await seedPlace();
  await Interaction.create({ placeId, guestId: "guest-1", rating: 4 });
  await Interaction.create({
    placeId,
    guestId: "guest-2",
    reviewText: "Good coffee",
  });

  const { data, errors } = await run(
    `query ($placeId: ID!) {
      placeReviews(placeId: $placeId) { reviews { placeId } }
    }`,
    { placeId },
  );

  assert.equal(errors, undefined);
  assert.deepEqual(data, {
    placeReviews: { reviews: [{ placeId }, { placeId }] },
  });
});

test("PlaceProperties has no reviews field", async () => {
  const { errors } = await run(
    `{ places { places { properties { reviews { id } } } } }`,
  );

  assert.match(
    String(errors?.[0]?.message),
    /Cannot query field "reviews" on type "PlaceProperties"/,
  );
});
