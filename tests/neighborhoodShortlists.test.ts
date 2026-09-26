/**
 * neighborhoodShortlists against a throwaway mongod.
 *
 * A Place makes a Shortlist when it is visible, is in the Neighborhood, has all
 * the Shortlist's Amenities (each through its synonyms) and has an Average
 * rating of at least 4.0. The map's "See all N" runs filteredPlaces with the
 * same Amenities and minRating 4, so both have to agree on N.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { neighborhoodShortlistsResolver } = await import(
  "../src/graphql/resolvers/neighborhoodShortlistsResolver/neighborhoodShortlistsResolver.js"
);
const { filteredPlacesResolver } = await import(
  "../src/graphql/resolvers/filteredPlacesResolver/filteredPlacesResolver.js"
);

useThrowawayMongod();

beforeEach(async () => {
  await Place.deleteMany({});
  await Interaction.deleteMany({});
});

let guestCounter = 0;

/**
 * Seeds a Place with the given Amenities and one Rating per entry of
 * `ratings`, each from its own Guest. Returns the Place id.
 */
async function seedPlace(
  name: string,
  amenities: string[],
  ratings: number[] = [],
  properties: Record<string, unknown> = {},
) {
  const place = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: {
      name,
      address: "Somewhere 1, Berlin",
      neighborhood: "Mitte",
      additionalInfo: { Amenities: amenities.map((a) => ({ [a]: true })) },
      ...properties,
    },
  });
  await Interaction.insertMany(
    ratings.map((rating) => ({
      placeId: place._id,
      guestId: `guest-${++guestCounter}`,
      rating,
    })),
  );
  return place._id.toString();
}

type Ctx = Parameters<typeof neighborhoodShortlistsResolver>[2];

async function shortlists(neighborhood = "Mitte", context: Ctx = {}) {
  return neighborhoodShortlistsResolver(
    undefined as never,
    { neighborhood },
    context,
  );
}

async function shortlist(
  id: string,
  neighborhood = "Mitte",
  context: Ctx = {},
) {
  const found = (await shortlists(neighborhood, context)).find(
    (s) => s.id === id,
  );
  assert.ok(found, `Shortlist ${id} is returned`);
  return found;
}

const names = (s: { places: { properties: { name: string } }[] }) =>
  s.places.map((p) => p.properties.name);

test("all four Shortlists come back in order, with their Amenities", async () => {
  const result = await shortlists();

  assert.deepEqual(
    result.map((s) => [s.id, s.amenities]),
    [
      ["work", ["Good for working on laptop", "Wi-Fi"]],
      ["dogFriendly", ["Dogs allowed"]],
      ["outdoorSeating", ["Outdoor seating"]],
      ["breakfastBrunch", ["Breakfast"]],
    ],
  );
});

test("a Place qualifies only with all Amenities of the set", async () => {
  await seedPlace("Both", ["Good for working on laptop", "Wi-Fi"], [5]);
  await seedPlace("Laptop only", ["Good for working on laptop"], [5]);
  await seedPlace("Wifi only", ["Wi-Fi"], [5]);

  const work = await shortlist("work");

  assert.deepEqual(names(work), ["Both"]);
  assert.equal(work.total, 1);
});

test("the threshold is 4.0 on the unrounded Average rating", async () => {
  // 24 fours and a three: 3.96, shown as 4.0 but under the threshold.
  await seedPlace("Almost", ["Outdoor seating"], [...Array(24).fill(4), 3]);
  await seedPlace("Under", ["Outdoor seating"], [4, 4, 4, 4, 4, 4, 4, 4, 4, 3]);
  await seedPlace("Exactly", ["Outdoor seating"], [4]);
  await seedPlace("Unrated", ["Outdoor seating"]);

  const outdoor = await shortlist("outdoorSeating");

  assert.deepEqual(names(outdoor), ["Exactly"]);
  assert.equal(outdoor.total, 1);
});

test("places are ordered by Average rating, then Rating count, then name; five at most, total counts all", async () => {
  const dog = ["Dogs allowed"];
  await seedPlace("Eel", dog, [4]);
  await seedPlace("Bee", dog, [4, 5]);
  await seedPlace("Cat", dog, [4, 4, 5, 4]);
  await seedPlace("Zed", dog, [5]);
  await seedPlace("Many", dog, [5, 4, 5, 4]);
  await seedPlace("Dog", dog, [4]);
  await seedPlace("Ant", dog, [5, 4]);

  const dogFriendly = await shortlist("dogFriendly");

  // Zed 5.0; Many 4.5 (4 Ratings); Ant, Bee 4.5 (2 Ratings, by name);
  // Cat 4.25; Dog, Eel 4.0 (by name) are cut off.
  assert.deepEqual(names(dogFriendly), ["Zed", "Many", "Ant", "Bee", "Cat"]);
  assert.equal(dogFriendly.total, 7);
});

test("every spelling of an Amenity qualifies", async () => {
  await seedPlace(
    "Free wifi",
    ["Good for working on laptop", "Free Wi-Fi"],
    [5],
  );
  await seedPlace("Dogs inside", ["Dogs allowed inside"], [5]);
  await seedPlace("Dogs outside", ["Dogs allowed outside"], [5]);
  await seedPlace("Brunch", ["Brunch"], [5]);

  assert.deepEqual(names(await shortlist("work")), ["Free wifi"]);
  assert.deepEqual(names(await shortlist("dogFriendly")).sort(), [
    "Dogs inside",
    "Dogs outside",
  ]);
  assert.deepEqual(names(await shortlist("breakfastBrunch")), ["Brunch"]);
});

test("closed Places and Places in other Neighborhoods are left out", async () => {
  await seedPlace("Open", ["Breakfast"], [5]);
  await seedPlace("Closed", ["Breakfast"], [5], {
    businessStatus: "CLOSED_PERMANENTLY",
  });
  await seedPlace("Paused", ["Breakfast"], [5], {
    businessStatus: "CLOSED_TEMPORARILY",
  });
  await seedPlace("Elsewhere", ["Breakfast"], [5], { neighborhood: "Pankow" });

  const breakfast = await shortlist("breakfastBrunch");

  assert.deepEqual(names(breakfast), ["Open"]);
  assert.equal(breakfast.total, 1);
});

test("the Neighborhood slug is normalized", async () => {
  await seedPlace("Kreuzberg Terrace", ["Outdoor seating"], [5], {
    neighborhood: "Friedrichshain-Kreuzberg",
  });

  const outdoor = await shortlist("outdoorSeating", "friedrichshain-kreuzberg");

  assert.deepEqual(names(outdoor), ["Kreuzberg Terrace"]);
});

test("an unknown Neighborhood returns four empty Shortlists in order", async () => {
  await seedPlace("Somewhere", ["Outdoor seating"], [5]);

  const result = await shortlists("atlantis");

  assert.deepEqual(
    result.map((s) => [s.id, s.places, s.total]),
    [
      ["work", [], 0],
      ["dogFriendly", [], 0],
      ["outdoorSeating", [], 0],
      ["breakfastBrunch", [], 0],
    ],
  );
});

test("places have the shape filteredPlaces gives them, and isFavorite is the caller's", async () => {
  const placeId = await seedPlace("Terrace", ["Outdoor seating"], [4, 5]);
  const userId = new mongoose.Types.ObjectId();
  await Interaction.create({
    placeId,
    userId,
    isFavorite: true,
  });

  const [fromShortlist] = (
    await shortlist("outdoorSeating", "Mitte", {
      user: { id: userId.toString() },
    })
  ).places;
  const anonymous = (await shortlist("outdoorSeating")).places[0];
  const {
    places: [fromFilter],
  } = await filteredPlacesResolver(
    undefined as never,
    { neighborhood: ["Mitte"], additionalInfo: ["Outdoor seating"] },
    { user: { id: userId.toString() } },
  );

  assert.deepEqual(fromShortlist, fromFilter);
  assert.equal(fromShortlist.properties.isFavorite, true);
  assert.equal(anonymous.properties.isFavorite, false);
  assert.equal(fromShortlist.properties.averageRating, 4.5);
  assert.equal(fromShortlist.properties.ratingCount, 2);
});

test("filteredPlaces with a Shortlist's Amenities and minRating 4 agrees on the total", async () => {
  await seedPlace(
    "Work both",
    ["Good for working on laptop", "Free Wi-Fi"],
    [5],
  );
  await seedPlace("Work laptop", ["Good for working on laptop"], [5]);
  await seedPlace(
    "Work almost",
    ["Good for working on laptop", "Wi-Fi"],
    [...Array(24).fill(4), 3],
  );
  await seedPlace("Dogs", ["Dogs allowed inside"], [4]);
  await seedPlace("Dogs low", ["Dogs allowed"], [3]);
  await seedPlace("Dogs elsewhere", ["Dogs allowed"], [5], {
    neighborhood: "Pankow",
  });
  await seedPlace("Terrace", ["Outdoor seating"], [4, 5]);
  await seedPlace("Brunch", ["Brunch"], [5]);
  await seedPlace("Breakfast", ["Breakfast"], [4]);

  for (const { id, amenities, total } of await shortlists()) {
    const filtered = await filteredPlacesResolver(
      undefined as never,
      { neighborhood: ["Mitte"], additionalInfo: amenities, minRating: 4 },
      {},
    );
    assert.equal(filtered.total, total, id);
  }
  assert.deepEqual(
    (await shortlists()).map((s) => s.total),
    [1, 1, 1, 2],
  );
});

test("ownRating and ownCharacteristics come from the caller's own Review, User or Guest", async () => {
  const placeId = await seedPlace("Terrace", ["Outdoor seating"], [4, 5]);
  const userId = new mongoose.Types.ObjectId();
  await Interaction.create({
    placeId,
    userId,
    rating: 5,
    characteristics: { outdoorSeating: true, freeWifi: true },
  });
  await Interaction.create({ placeId, guestId: "own-guest", rating: 4 });
  const asGuest: Ctx = {
    guest: {
      status: "valid",
      identity: { guestId: "own-guest" },
    } as Ctx["guest"],
  };

  const own = async (context: Ctx) => {
    const [fromShortlist] = (
      await shortlist("outdoorSeating", "Mitte", context)
    ).places;
    const {
      places: [fromFilter],
    } = await filteredPlacesResolver(
      undefined as never,
      { neighborhood: ["Mitte"] },
      context,
    );
    assert.deepEqual(fromShortlist, fromFilter);
    const { ownRating, ownCharacteristics } = fromShortlist.properties;
    return { ownRating, ownCharacteristics };
  };

  assert.deepEqual(await own({ user: { id: userId.toString() } }), {
    ownRating: 5,
    ownCharacteristics: ["freeWifi", "outdoorSeating"],
  });
  assert.deepEqual(await own(asGuest), {
    ownRating: 4,
    ownCharacteristics: [],
  });
  // Someone with no Review of their own: the others' Reviews don't leak in
  assert.deepEqual(
    await own({ user: { id: new mongoose.Types.ObjectId().toString() } }),
    { ownRating: null, ownCharacteristics: null },
  );
  assert.deepEqual(await own({}), {
    ownRating: null,
    ownCharacteristics: null,
  });
});

test("a Favorite without a Rating gives no ownRating", async () => {
  const placeId = await seedPlace("Terrace", ["Outdoor seating"], [5]);
  const userId = new mongoose.Types.ObjectId();
  await Interaction.create({ placeId, userId, isFavorite: true });

  const [place] = (
    await shortlist("outdoorSeating", "Mitte", {
      user: { id: userId.toString() },
    })
  ).places;

  assert.equal(place.properties.ownRating, null);
  assert.deepEqual(place.properties.ownCharacteristics, []);
});
