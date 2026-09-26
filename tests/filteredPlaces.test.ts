/**
 * filteredPlaces Amenity Filters against a throwaway mongod.
 *
 * Google spells some Amenities in several ways; a Filter on one spelling has
 * to find the Places listed under any of them.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: Place } = await import("../src/models/Place.js");
const { filteredPlacesResolver } = await import(
  "../src/graphql/resolvers/filteredPlacesResolver/filteredPlacesResolver.js"
);

useThrowawayMongod();

beforeEach(async () => {
  await Place.deleteMany({});
});

/** Seeds a Place with the given Amenities, as Google's import stores them. */
async function seedPlace(
  name: string,
  amenities: Record<string, string[]>,
  properties: Record<string, unknown> = {},
) {
  await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: {
      name,
      address: "Somewhere 1, Berlin",
      neighborhood: "Mitte",
      additionalInfo: Object.fromEntries(
        Object.entries(amenities).map(([category, names]) => [
          category,
          names.map((amenity) => ({ [amenity]: true })),
        ]),
      ),
      ...properties,
    },
  });
}

async function namesFor(additionalInfo: string[]) {
  const { places, total } = await filteredPlacesResolver(
    undefined as never,
    { additionalInfo },
    {},
  );
  const names = places.map((p) => p.properties.name).sort();
  assert.equal(total, names.length);
  return names;
}

test("a Filter on one spelling finds the Places listed under another", async () => {
  await seedPlace("Wifi Cafe", { Amenities: ["Wi-Fi"] });
  await seedPlace("Free Wifi Cafe", { Amenities: ["Free Wi-Fi"] });
  await seedPlace("Offline Cafe", { Amenities: ["Restroom"] });

  assert.deepEqual(await namesFor(["Wi-Fi"]), ["Free Wifi Cafe", "Wifi Cafe"]);
  assert.deepEqual(await namesFor(["Free Wi-Fi"]), [
    "Free Wifi Cafe",
    "Wifi Cafe",
  ]);
});

test("a Filter on Dogs allowed finds every variant of it", async () => {
  await seedPlace("Dogs Anywhere", { Pets: ["Dogs allowed"] });
  await seedPlace("Dogs Inside", { Pets: ["Dogs allowed inside"] });
  await seedPlace("Dogs Outside", { Pets: ["Dogs allowed outside"] });
  await seedPlace("No Dogs", { Amenities: ["Wi-Fi"] });

  assert.deepEqual(await namesFor(["Dogs allowed"]), [
    "Dogs Anywhere",
    "Dogs Inside",
    "Dogs Outside",
  ]);
});

test("Amenities combine with AND, each through its own spellings", async () => {
  await seedPlace("Both", {
    Amenities: ["Free Wi-Fi"],
    Atmosphere: ["Cosy"],
  });
  await seedPlace("Only Wifi", { Amenities: ["Wi-Fi"] });
  await seedPlace("Only Cozy", { Atmosphere: ["Cozy"] });

  assert.deepEqual(await namesFor(["Wi-Fi", "Cozy"]), ["Both"]);
});

test("a name outside the synonym table matches only itself", async () => {
  await seedPlace("Terrace", { "Service options": ["Outdoor seating"] });
  await seedPlace("Wifi Cafe", { Amenities: ["Wi-Fi"] });

  assert.deepEqual(await namesFor(["Outdoor seating"]), ["Terrace"]);
  assert.deepEqual(await namesFor(["Outdoor"]), []);
});

test("a Place is only a match where the Amenity is true", async () => {
  await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: {
      name: "No Wifi",
      address: "Somewhere 1, Berlin",
      additionalInfo: { Amenities: [{ "Free Wi-Fi": false }] },
    },
  });

  assert.deepEqual(await namesFor(["Wi-Fi"]), []);
});

test("closed Places are left out", async () => {
  await seedPlace("Open", { Amenities: ["Free Wi-Fi"] });
  await seedPlace(
    "Closed",
    { Amenities: ["Wi-Fi"] },
    { businessStatus: "CLOSED_PERMANENTLY" },
  );
  await seedPlace(
    "Paused",
    { Amenities: ["Wi-Fi"] },
    { businessStatus: "CLOSED_TEMPORARILY" },
  );

  assert.deepEqual(await namesFor(["Wi-Fi"]), ["Open"]);
});
