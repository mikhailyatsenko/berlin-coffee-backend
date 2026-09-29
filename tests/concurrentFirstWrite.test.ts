/**
 * A person's first write to a Place (a Rating, Review text, a Characteristic or
 * a Favorite) is one atomic upsert, so two concurrent first writes (a double
 * tap, a Rating and a Characteristic sent together) merge into one Review
 * instead of failing on the unique index. The Guest quota is counted only by
 * the call that created it.
 * Against a throwaway mongod.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { default: User } = await import("../src/models/User.js");
const { default: Place } = await import("../src/models/Place.js");
const { default: Interaction } = await import("../src/models/Interaction.js");
const { addRatingResolver } = await import(
  "../src/graphql/resolvers/addRatingResolver/addRatingResolver.js"
);
const { addTextReviewResolver } = await import(
  "../src/graphql/resolvers/addTextReviewResolver/addTextReviewResolver.js"
);
const { toggleCharacteristicResolver } = await import(
  "../src/graphql/resolvers/toggleCharacteristicResolver/toggleCharacteristicResolver.js"
);
const { toggleFavoriteResolver } = await import(
  "../src/graphql/resolvers/toggleFavoriteResolver/toggleFavoriteResolver.js"
);
import { callResolver, type TestContext } from "./support/callResolver.js";
import { clientCode } from "./support/clientCode.js";

// --- helpers -----------------------------------------------------------------

/** An assert.rejects validator for the code the client sees, after formatError. */
const withCode = (code: string) => (error: unknown) => {
  assert.equal(clientCode(error), code);
  return true;
};

const createUser = () =>
  User.create({
    email: "anna@x.de",
    displayName: "Anna",
    isEmailConfirmed: true,
  });

let placeCount = 0;
const createPlace = () =>
  Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: { name: `Place ${++placeCount}`, address: "Oderberger Str. 35" },
  });

let ipCount = 0;
/** A Guest with a fresh IP, so each test starts with a full quota. */
const guestContext = (): TestContext => ({
  guest: {
    status: "valid",
    identity: { guestId: `guest-${++ipCount}` },
  } as never,
  req: { ip: `10.0.0.${ipCount}` } as never,
});

useThrowawayMongod();

beforeEach(async () => {
  await User.deleteMany({});
  await Place.deleteMany({});
  await Interaction.deleteMany({});
  await Interaction.syncIndexes();
});

// --- concurrent first writes -------------------------------------------------

const firstWrites = {
  addRating: (placeId: string, context: TestContext) =>
    callResolver(addRatingResolver, { placeId, rating: 4 }, context),
  addTextReview: (placeId: string, context: TestContext) =>
    callResolver(addTextReviewResolver, { placeId, text: "Great" }, context),
  toggleCharacteristic: (placeId: string, context: TestContext) =>
    callResolver(
      toggleCharacteristicResolver,
      { placeId, characteristic: "freeWifi" },
      context,
    ),
  toggleFavorite: (placeId: string, context: TestContext) =>
    callResolver(toggleFavoriteResolver, { placeId }, context),
};

for (const [name, write] of Object.entries(firstWrites)) {
  test(`${name}: two concurrent first calls both succeed and leave one Review`, async () => {
    const user = await createUser();
    const place = await createPlace();

    await Promise.all([
      write(place.id, { user }),
      write(place.id, { user }),
    ]);

    assert.equal(
      await Interaction.countDocuments({ userId: user.id, placeId: place.id }),
      1,
    );
  });
}

test("addRating and toggleCharacteristic sent together leave one Review with both", async () => {
  const user = await createUser();
  const place = await createPlace();

  await Promise.all([
    firstWrites.addRating(place.id, { user }),
    firstWrites.toggleCharacteristic(place.id, { user }),
  ]);

  const interactions = await Interaction.find({ placeId: place.id }).lean();
  assert.equal(interactions.length, 1);
  assert.equal(interactions[0].rating, 4);
  assert.equal(interactions[0].characteristics.freeWifi, true);
});

test("addRating returns the id of the Review both concurrent calls wrote", async () => {
  const user = await createUser();
  const place = await createPlace();

  const [first, second] = await Promise.all([
    firstWrites.addRating(place.id, { user }),
    firstWrites.addRating(place.id, { user }),
  ]);

  const interaction = await Interaction.findOne({ placeId: place.id });
  assert.equal(first.reviewId, interaction!.id);
  assert.equal(second.reviewId, interaction!.id);
});

// --- toggles stay toggles ----------------------------------------------------

test("toggleCharacteristic: a first toggle marks it, a second unmarks it", async () => {
  const user = await createUser();
  const place = await createPlace();

  await firstWrites.toggleCharacteristic(place.id, { user });
  let interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.characteristics.freeWifi, true);
  assert.equal(interaction!.characteristics.petFriendly, false);

  await firstWrites.toggleCharacteristic(place.id, { user });
  interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.characteristics.freeWifi, false);
});

test("toggleFavorite: a first toggle saves the Favorite, a second removes it", async () => {
  const user = await createUser();
  const place = await createPlace();

  await firstWrites.toggleFavorite(place.id, { user });
  let interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.isFavorite, true);

  await firstWrites.toggleFavorite(place.id, { user });
  interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.isFavorite, false);
});

test("a first Favorite creates its Review with the schema defaults", async () => {
  const user = await createUser();
  const place = await createPlace();

  await firstWrites.toggleFavorite(place.id, { user });

  const interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.reviewImages, 0);
  assert.equal(interaction!.isGoogleReview, false);
  assert.equal(interaction!.characteristics.freeWifi, false);
  assert.ok(interaction!.date instanceof Date);
});

for (const name of ["toggleCharacteristic", "toggleFavorite"] as const) {
  test(`${name}: two concurrent toggles on an existing Review cancel out`, async () => {
    const user = await createUser();
    const place = await createPlace();
    await firstWrites.addRating(place.id, { user });

    await Promise.all([
      firstWrites[name](place.id, { user }),
      firstWrites[name](place.id, { user }),
    ]);

    const interaction = await Interaction.findOne({ placeId: place.id }).lean();
    assert.equal(interaction!.characteristics.freeWifi, false);
    assert.equal(interaction!.isFavorite, false);
  });
}

// --- Guest quota -------------------------------------------------------------

/** guestReview allows 3 first writes an hour: spend the rest, then expect a refusal. */
const assertFirstWritesLeft = async (left: number, context: TestContext) => {
  for (let i = 0; i < left; i++) {
    const place = await createPlace();
    await firstWrites.addRating(place.id, context);
  }
  const place = await createPlace();
  await assert.rejects(
    firstWrites.addRating(place.id, context),
    withCode("RATE_LIMITED"),
  );
};

test("Guest quota: a first Rating costs one, updating it costs nothing", async () => {
  const guest = guestContext();
  const place = await createPlace();

  await callResolver(addRatingResolver, { placeId: place.id, rating: 3 }, guest);
  for (const rating of [4, 5, 2, 1]) {
    await callResolver(addRatingResolver, { placeId: place.id, rating }, guest);
  }

  const interaction = await Interaction.findOne({ placeId: place.id }).lean();
  assert.equal(interaction!.rating, 1);
  await assertFirstWritesLeft(2, guest);
});

test("Guest quota: two concurrent first Ratings cost one", async () => {
  const guest = guestContext();
  const place = await createPlace();

  await Promise.all([
    firstWrites.addRating(place.id, guest),
    firstWrites.addRating(place.id, guest),
  ]);

  assert.equal(await Interaction.countDocuments({ placeId: place.id }), 1);
  await assertFirstWritesLeft(2, guest);
});

test("Guest quota: Review text on a rated Place costs nothing", async () => {
  const guest = guestContext();
  const place = await createPlace();

  await firstWrites.addRating(place.id, guest);
  await firstWrites.addTextReview(place.id, guest);
  await firstWrites.toggleCharacteristic(place.id, guest);

  await assertFirstWritesLeft(2, guest);
});

test("Guest quota: an exhausted Guest can still update, but a refused first write stores nothing", async () => {
  const guest = guestContext();
  const rated = await createPlace();
  await firstWrites.addRating(rated.id, guest);
  await assertFirstWritesLeft(2, guest);

  await callResolver(addRatingResolver, { placeId: rated.id, rating: 5 }, guest);
  await firstWrites.addTextReview(rated.id, guest);
  await firstWrites.toggleCharacteristic(rated.id, guest);

  const fresh = await createPlace();
  await assert.rejects(
    firstWrites.toggleCharacteristic(fresh.id, guest),
    withCode("RATE_LIMITED"),
  );
  await assert.rejects(
    firstWrites.addTextReview(fresh.id, guest),
    withCode("RATE_LIMITED"),
  );
  assert.equal(await Interaction.countDocuments({ placeId: fresh.id }), 0);

  const interaction = await Interaction.findOne({ placeId: rated.id }).lean();
  assert.equal(interaction!.rating, 5);
  assert.equal(interaction!.reviewText, "Great");
});

test("Guest quota: with one first write left, two concurrent first Ratings on different Places store only one", async () => {
  const guest = guestContext();
  const [a, b, c, d] = [
    await createPlace(),
    await createPlace(),
    await createPlace(),
    await createPlace(),
  ];
  await firstWrites.addRating(a.id, guest);
  await firstWrites.addRating(b.id, guest);

  const results = await Promise.allSettled([
    firstWrites.addRating(c.id, guest),
    firstWrites.addRating(d.id, guest),
  ]);

  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(refused.length, 1);
  withCode("RATE_LIMITED")((refused[0] as PromiseRejectedResult).reason);
  assert.equal(
    await Interaction.countDocuments({ placeId: { $in: [c.id, d.id] } }),
    1,
  );
});

// --- duplicate key -----------------------------------------------------------

/** Makes the next `failures` upserts throw E11000, as a lost insert race would. */
const failNextUpserts = (failures: number, t: { after: (fn: () => void) => void }) => {
  const original = Interaction.findOneAndUpdate;
  let left = failures;
  Interaction.findOneAndUpdate = function (this: unknown, ...args: unknown[]) {
    const options = args[2] as { upsert?: boolean } | undefined;
    if (options?.upsert && left > 0) {
      left--;
      return Promise.reject(
        Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }),
      );
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof original;
  t.after(() => {
    Interaction.findOneAndUpdate = original;
  });
};

test("a duplicate-key error on the upsert is retried once", async (t) => {
  const user = await createUser();
  const place = await createPlace();
  failNextUpserts(1, t);

  await firstWrites.addRating(place.id, { user });

  assert.equal(await Interaction.countDocuments({ placeId: place.id }), 1);
});

test("a second duplicate-key error is not retried again", async (t) => {
  const user = await createUser();
  const place = await createPlace();
  failNextUpserts(2, t);

  await assert.rejects(
    firstWrites.addRating(place.id, { user }),
    withCode("INTERNAL_SERVER_ERROR"),
  );
});
