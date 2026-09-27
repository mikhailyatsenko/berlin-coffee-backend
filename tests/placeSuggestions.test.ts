/**
 * Place suggestions: submitting one and opening it from the admin's review
 * link, against a throwaway mongod and a fake MailerSend.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { GraphQLError } from "graphql";
import type { Request } from "express";
import type { IUser } from "../src/models/User.js";
import type { GuestContext } from "../src/utils/guestAuth.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";

setTestEnv();

const { MailerSend } = await import("mailersend");
const { default: PlaceSuggestion } = await import(
  "../src/models/PlaceSuggestion.js"
);
const { default: Place } = await import("../src/models/Place.js");
const { default: User } = await import("../src/models/User.js");
const { createGuestIdentity } = await import("../src/utils/guestAuth.js");
const { submitPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/submitPlaceSuggestionResolver.js"
);
const { placeSuggestionForReviewResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/placeSuggestionForReviewResolver.js"
);
const { publishPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/publishPlaceSuggestionResolver.js"
);
const { rejectPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/rejectPlaceSuggestionResolver.js"
);
const { ADMIN_EMAIL, FROM_EMAIL } = await import(
  "../src/graphql/resolvers/contactFormResolver/constants/index.js"
);

// --- fake MailerSend -------------------------------------------------------

interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

const sent: SentEmail[] = [];
let sendFails = false;

const emailModule = new MailerSend({ apiKey: "test" }).email;
(
  Object.getPrototypeOf(emailModule) as {
    send: (params: {
      from: { email: string };
      to: { email: string }[];
      subject: string;
      text: string;
      html: string;
    }) => Promise<unknown>;
  }
).send = async (params) => {
  if (sendFails) throw new Error("MailerSend 500");
  sent.push({
    from: params.from.email,
    to: params.to.map((r) => r.email),
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  return {};
};

// --- mongod ----------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  sent.length = 0;
  sendFails = false;
  await PlaceSuggestion.deleteMany({});
  await Place.deleteMany({});
  await User.deleteMany({});
});

// --- helpers ---------------------------------------------------------------

/** Every test gets its own IP, so the in-memory daily limit never leaks between them. */
let ipCounter = 0;
const freshReq = () => ({ ip: `10.0.0.${++ipCounter}` }) as Request;

const aUser = () =>
  ({ id: new mongoose.Types.ObjectId().toString() }) as Pick<
    IUser,
    "id"
  > as IUser;

async function aGuest() {
  const { guestId, guestSecret } = await createGuestIdentity();
  const GuestIdentity = (await import("../src/models/GuestIdentity.js"))
    .default;
  const identity = await GuestIdentity.findOne({ guestId });
  assert.ok(identity);
  return {
    guestId,
    guestSecret,
    context: { guest: { status: "valid" as const, identity } },
  };
}

const input = (over: Record<string, string | undefined> = {}) => ({
  name: "Bonanza Coffee",
  address: "Oderberger Str. 35, 10435 Berlin",
  ...over,
});

const submit = (
  args: {
    input: ReturnType<typeof input>;
    guestId?: string;
    guestSecret?: string;
  },
  context: {
    user?: IUser | null;
    guest?: GuestContext;
    req?: Request;
  },
) =>
  submitPlaceSuggestionResolver(undefined as never, args, {
    req: freshReq(),
    ...context,
  } as never);

const review = (id: string, token: string) =>
  placeSuggestionForReviewResolver(undefined as never, { id, token });

/** Coordinates and Neighborhood are inside Berlin and one of the twelve by default. */
const publishInput = (over: Record<string, unknown> = {}) => ({
  name: "Bonanza Coffee",
  address: "Oderberger Str. 35, 10435 Berlin",
  coordinates: { lat: 52.55, lng: 13.4 },
  neighborhood: "Mitte",
  ...over,
});

const publish = (
  id: string,
  token: string,
  input: ReturnType<typeof publishInput>,
) =>
  publishPlaceSuggestionResolver(undefined as never, { id, token, input });

const reject = (id: string, token: string) =>
  rejectPlaceSuggestionResolver(undefined as never, { id, token });

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof GraphQLError, `not a GraphQLError: ${String(e)}`);
    return e.extensions.code;
  }
  assert.fail("expected the call to be rejected");
};

/** The review link of the only email sent so far. */
function reviewLinkOf(email: SentEmail) {
  const match = email.text.match(
    /https?:\/\/\S+\/suggestions\/([0-9a-f]{24})\/review\?token=([0-9a-f]+)/,
  );
  assert.ok(match, `no review link in: ${email.text}`);
  return { url: match[0], id: match[1], token: match[2] };
}

// --- tests -----------------------------------------------------------------

test("a User's suggestion is stored as pending with the User as owner, and no email of theirs", async () => {
  const user = aUser();

  const id = await submit(
    {
      input: input({
        description: "Great flat white",
        instagram: "@bonanza",
        email: "user@example.com",
      }),
    },
    { user },
  );

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.ok(doc);
  assert.equal(doc.name, "Bonanza Coffee");
  assert.equal(doc.address, "Oderberger Str. 35, 10435 Berlin");
  assert.equal(doc.description, "Great flat white");
  assert.equal(doc.instagram, "@bonanza");
  assert.equal(doc.status, "pending");
  assert.equal(doc.photoCount, 0);
  assert.equal(String(doc.userId), user.id);
  assert.ok(!("guestId" in doc), "guestId must be absent, not null");
  assert.ok(!("guestEmail" in doc), "a User's email is not stored");
});

test("a Guest's suggestion is stored with the Guest as owner and their email", async () => {
  const guest = await aGuest();

  const id = await submit(
    { input: input({ email: "guest@example.com" }) },
    guest.context,
  );

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.ok(doc);
  assert.equal(doc.guestId, guest.guestId);
  assert.equal(doc.guestEmail, "guest@example.com");
  assert.ok(!("userId" in doc), "userId must be absent, not null");
  assert.equal(doc.status, "pending");
});

test("a Guest identity sent as arguments works like one sent as headers", async () => {
  const guest = await aGuest();

  const id = await submit(
    { input: input(), guestId: guest.guestId, guestSecret: guest.guestSecret },
    {},
  );

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.equal(doc?.guestId, guest.guestId);
});

test("an invalid Guest identity, or none at all, is rejected and stores nothing", async () => {
  const stale: GuestContext = { status: "invalid", reason: "not_found" };
  assert.equal(
    await codeOf(submit({ input: input() }, { guest: stale })),
    "GUEST_IDENTITY_INVALID",
  );
  assert.equal(
    await codeOf(
      submit({ input: input(), guestId: "nope", guestSecret: "nope" }, {}),
    ),
    "GUEST_IDENTITY_INVALID",
  );
  assert.equal(await codeOf(submit({ input: input() }, {})), "UNAUTHENTICATED");

  assert.equal(await PlaceSuggestion.countDocuments(), 0);
  assert.equal(sent.length, 0);
});

test("required fields and lengths are enforced", async () => {
  const user = aUser();
  const bad = [
    input({ name: "" }),
    input({ name: "   " }),
    input({ address: "" }),
    input({ description: "x".repeat(501) }),
    input({ name: "x".repeat(201) }),
    input({ address: "x".repeat(301) }),
    input({ instagram: "x".repeat(201) }),
  ];
  for (const one of bad) {
    assert.equal(
      await codeOf(submit({ input: one }, { user })),
      "BAD_USER_INPUT",
      JSON.stringify(one).slice(0, 80),
    );
  }

  // The boundary itself is fine.
  await submit({ input: input({ description: "x".repeat(500) }) }, { user });

  assert.equal(await PlaceSuggestion.countDocuments(), 1);
});

test("a Guest email must look like an email; a User's is ignored", async () => {
  const guest = await aGuest();
  assert.equal(
    await codeOf(
      submit({ input: input({ email: "not an email" }) }, guest.context),
    ),
    "BAD_USER_INPUT",
  );

  // An empty email means none was given.
  const id = await submit({ input: input({ email: "  " }) }, guest.context);
  const doc = await PlaceSuggestion.findById(id).lean();
  assert.ok(!("guestEmail" in (doc ?? {})));

  // A User's is never validated, never stored.
  await submit({ input: input({ email: "garbage" }) }, { user: aUser() });
});

test("a rejected submission does not use up the daily limit", async () => {
  const user = aUser();
  const req = freshReq();
  for (let i = 0; i < 5; i++) {
    await codeOf(submit({ input: input({ name: "" }) }, { user, req }));
  }
  for (let i = 0; i < 3; i++) {
    await submit({ input: input() }, { user, req });
  }
});

test("the 4th submission in a day from one IP gets RATE_LIMITED, for Users and Guests alike", async () => {
  const req = freshReq();
  const guest = await aGuest();

  await submit({ input: input() }, { user: aUser(), req });
  await submit({ input: input() }, { ...guest.context, req });
  await submit({ input: input() }, { user: aUser(), req });

  assert.equal(
    await codeOf(submit({ input: input() }, { ...guest.context, req })),
    "RATE_LIMITED",
  );
  assert.equal(
    await codeOf(submit({ input: input() }, { user: aUser(), req })),
    "RATE_LIMITED",
  );
  assert.equal(await PlaceSuggestion.countDocuments(), 3);

  // Another address is unaffected.
  await submit({ input: input() }, { user: aUser(), req: freshReq() });
});

test("the admin gets an email with the suggestion and a link whose token opens it", async () => {
  const id = await submit(
    {
      input: input({
        description: "Great flat white",
        instagram: "@bonanza",
      }),
    },
    { user: aUser() },
  );

  assert.equal(sent.length, 1);
  const [email] = sent;
  assert.deepEqual(email.to, [ADMIN_EMAIL]);
  assert.equal(email.from, FROM_EMAIL);
  for (const body of [email.text, email.html]) {
    assert.ok(body.includes("Bonanza Coffee"));
    assert.ok(body.includes("Oderberger Str. 35, 10435 Berlin"));
  }
  assert.match(email.text, /user/i);

  const link = reviewLinkOf(email);
  assert.equal(link.id, id);
  assert.ok(
    email.html.includes(link.url),
    "the HTML body carries the link too",
  );

  const opened = await review(link.id, link.token);
  assert.equal(opened.id, id);
  assert.equal(opened.name, "Bonanza Coffee");
  assert.equal(opened.address, "Oderberger Str. 35, 10435 Berlin");
  assert.equal(opened.description, "Great flat white");
  assert.equal(opened.instagram, "@bonanza");
  assert.equal(opened.suggestedBy, "user");
  assert.equal(opened.status, "pending");
  assert.equal(opened.publishedPlaceId, null);
  assert.deepEqual(opened.photos, []);
  assert.deepEqual(opened.similarPending, []);
});

test("the admin email says a Guest suggested it, and HTML in the name is escaped", async () => {
  const guest = await aGuest();

  await submit(
    { input: input({ name: "<script>alert(1)</script>" }) },
    guest.context,
  );

  const [email] = sent;
  assert.match(email.text, /guest/i);
  assert.ok(!email.html.includes("<script>"), "user text must be escaped");
  const opened = await review(
    reviewLinkOf(email).id,
    reviewLinkOf(email).token,
  );
  assert.equal(opened.suggestedBy, "guest");
  assert.equal(opened.name, "<script>alert(1)</script>");
});

test("a failed email is logged but the suggestion is still saved and returned", async () => {
  sendFails = true;
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args) => void logged.push(args);
  try {
    const id = await submit({ input: input() }, { user: aUser() });
    assert.ok(await PlaceSuggestion.findById(id));
  } finally {
    console.error = originalError;
  }
  assert.ok(logged.length > 0, "the failure is logged");
});

test("a wrong token or an unknown id is rejected the same way, and the email is never in the response", async () => {
  const guest = await aGuest();
  const id = await submit(
    { input: input({ email: "secret-guest@example.com" }) },
    guest.context,
  );
  const link = reviewLinkOf(sent[0]);

  const wrongToken = await codeOf(review(id, "0".repeat(64)));
  const emptyToken = await codeOf(review(id, ""));
  const shortToken = await codeOf(review(id, link.token.slice(0, -2)));
  const otherId = new mongoose.Types.ObjectId().toString();
  const unknownId = await codeOf(review(otherId, link.token));
  const notAnId = await codeOf(review("nope", link.token));
  assert.equal(wrongToken, "INVALID_REVIEW_LINK");
  for (const code of [emptyToken, shortToken, unknownId, notAnId]) {
    assert.equal(code, wrongToken);
  }

  const opened = await review(link.id, link.token);
  assert.ok(!JSON.stringify(opened).includes("secret-guest@example.com"));
  assert.ok(!("guestEmail" in opened) && !("email" in opened));
});

test("a token is good for its own suggestion only", async () => {
  await submit({ input: input() }, { user: aUser() });
  await submit({ input: input({ name: "Other" }) }, { user: aUser() });
  const first = reviewLinkOf(sent[0]);
  const second = reviewLinkOf(sent[1]);

  assert.equal(
    await codeOf(review(second.id, first.token)),
    "INVALID_REVIEW_LINK",
  );
});

test("tokens do not depend on the process: the same suggestion always gets the same token", async () => {
  const { signReviewToken } = await import(
    "../src/utils/placeSuggestionToken.js"
  );
  const id = new mongoose.Types.ObjectId().toString();
  assert.equal(signReviewToken(id), signReviewToken(id));
  assert.notEqual(
    signReviewToken(id),
    signReviewToken(new mongoose.Types.ObjectId().toString()),
  );
});

test("similar pending suggestions are listed; the suggestion itself and decided ones are not", async () => {
  const user = aUser();
  const mine = await submit(
    { input: input({ name: "Bonanza Coffee Heroes" }) },
    { user },
  );
  const inner = await submit(
    { input: input({ name: "bonanza", address: "Somewhere 1" }) },
    { user },
  );
  const outer = await submit(
    {
      input: input({
        name: "The Original Bonanza Coffee Heroes Roastery",
        address: "Elsewhere 2",
      }),
    },
    { user },
  );
  const unrelated = await submit(
    { input: input({ name: "Populus" }) },
    { user },
  );
  const rejected = await submit(
    { input: input({ name: "Bonanza old" }) },
    { user },
  );
  await PlaceSuggestion.updateOne({ _id: rejected }, { status: "rejected" });
  const published = await submit(
    { input: input({ name: "Bonanza published" }) },
    { user },
  );
  await PlaceSuggestion.updateOne({ _id: published }, { status: "published" });

  const link = reviewLinkOf(sent[0]);
  assert.equal(link.id, mine);
  const opened = await review(link.id, link.token);

  assert.deepEqual(
    opened.similarPending
      .map((s) => ({ id: s.id, name: s.name, address: s.address }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [
      { id: inner, name: "bonanza", address: "Somewhere 1" },
      {
        id: outer,
        name: "The Original Bonanza Coffee Heroes Roastery",
        address: "Elsewhere 2",
      },
    ],
  );
  assert.ok(
    ![unrelated, rejected, published, mine].some((id) =>
      opened.similarPending.some((s) => s.id === id),
    ),
  );
});

test("a decided suggestion still opens and shows its outcome", async () => {
  await submit({ input: input() }, { user: aUser() });
  const link = reviewLinkOf(sent[0]);
  const placeId = new mongoose.Types.ObjectId();
  await PlaceSuggestion.updateOne(
    { _id: link.id },
    { status: "published", publishedPlaceId: placeId, decidedAt: new Date() },
  );

  const opened = await review(link.id, link.token);
  assert.equal(opened.status, "published");
  assert.equal(opened.publishedPlaceId, placeId.toString());
});

// --- publish / reject --------------------------------------------------

test("publishing requires name, address, coordinates inside Berlin and a known Neighborhood", async () => {
  const id = await submit({ input: input() }, { user: aUser() });
  const { token } = reviewLinkOf(sent[0]);

  const bad = [
    publishInput({ name: "" }),
    publishInput({ name: "   " }),
    publishInput({ address: "" }),
    publishInput({ coordinates: { lat: 53, lng: 13.4 } }), // north of Berlin
    publishInput({ coordinates: { lat: 52.5, lng: 14.5 } }), // east of Berlin
    publishInput({ neighborhood: "Nowhereville" }),
    publishInput({ neighborhood: "" }),
  ];
  for (const one of bad) {
    assert.equal(
      await codeOf(publish(id, token, one)),
      "BAD_USER_INPUT",
      JSON.stringify(one),
    );
  }

  assert.equal((await PlaceSuggestion.findById(id))?.status, "pending");
  assert.equal(await Place.countDocuments(), 0);
});

test("a duplicate Google Place ID fails with the existing Place's id", async () => {
  const existing = await Place.create({
    geometry: { coordinates: [13.4, 52.5] },
    properties: {
      name: "Already Here",
      address: "Somewhere 1, Berlin",
      googleId: "ChIJ-duplicate",
    },
  });

  const id = await submit({ input: input() }, { user: aUser() });
  const { token } = reviewLinkOf(sent[0]);

  try {
    await publish(id, token, publishInput({ googlePlaceId: "ChIJ-duplicate" }));
    assert.fail("expected Publish to be rejected");
  } catch (error) {
    assert.ok(error instanceof GraphQLError);
    assert.equal(error.extensions.code, "DUPLICATE_GOOGLE_PLACE_ID");
    assert.ok(error.message.includes(existing._id.toString()));
  }

  assert.equal((await PlaceSuggestion.findById(id))?.status, "pending");
});

test("Publish creates a visible Place with the given fields and [lng, lat] coordinates; the suggestion is published with its id", async () => {
  const id = await submit({ input: input() }, { user: aUser() });
  const { token } = reviewLinkOf(sent[0]);

  const outcome = await publish(
    id,
    token,
    publishInput({
      description: "Great flat white",
      instagram: "@bonanza",
      website: "https://bonanza.example",
      phone: "+49 30 1234567",
      googlePlaceId: "ChIJ-bonanza",
    }),
  );

  assert.equal(outcome.status, "published");
  assert.ok(outcome.publishedPlaceId);

  const place = await Place.findById(outcome.publishedPlaceId).lean();
  assert.ok(place);
  assert.deepEqual(place.geometry.coordinates, [13.4, 52.55]);
  assert.equal(place.properties.name, "Bonanza Coffee");
  assert.equal(place.properties.address, "Oderberger Str. 35, 10435 Berlin");
  assert.equal(place.properties.neighborhood, "Mitte");
  assert.equal(place.properties.description, "Great flat white");
  assert.equal(place.properties.instagram, "@bonanza");
  assert.equal(place.properties.website, "https://bonanza.example");
  assert.equal(place.properties.phone, "+49 30 1234567");
  assert.equal(place.properties.googleId, "ChIJ-bonanza");
  assert.equal(place.properties.businessStatus, "OPERATIONAL");
  // Empty Amenities and opening hours: Mongoose's minimize strips the empty
  // object/array before saving, so a lean read comes back without them.
  assert.deepEqual(place.properties.additionalInfo ?? {}, {});
  assert.deepEqual(place.properties.openingHours ?? [], []);

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.equal(doc?.status, "published");
  assert.equal(String(doc?.publishedPlaceId), outcome.publishedPlaceId);
  assert.ok(doc?.decidedAt);
});

test("the outcome email goes to the User's account email", async () => {
  const user = await User.create({
    email: "owner@example.com",
    displayName: "Owner",
    password: "hashed",
    isEmailConfirmed: true,
  });

  const id = await submit(
    { input: input() },
    { user: { id: user.id } as IUser },
  );
  const { token } = reviewLinkOf(sent[0]);
  sent.length = 0; // only the outcome email matters from here

  const outcome = await publish(id, token, publishInput());

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["owner@example.com"]);
  assert.ok(sent[0].text.includes(`/place/${outcome.publishedPlaceId}`));
});

test("the outcome email goes to the Guest's email, then it is erased", async () => {
  const guest = await aGuest();
  const id = await submit(
    { input: input({ email: "guest@example.com" }) },
    guest.context,
  );
  const { token } = reviewLinkOf(sent[0]);
  sent.length = 0;

  await publish(id, token, publishInput());

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["guest@example.com"]);

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.ok(!("guestEmail" in (doc ?? {})));
});

test("no outcome email is sent when a Guest gave none", async () => {
  const guest = await aGuest();
  const id = await submit({ input: input() }, guest.context);
  const { token } = reviewLinkOf(sent[0]);
  sent.length = 0;

  await publish(id, token, publishInput());

  assert.equal(sent.length, 0);
});

test("Reject marks the suggestion rejected, erases the email and sends nothing", async () => {
  const guest = await aGuest();
  const id = await submit(
    { input: input({ email: "guest@example.com" }) },
    guest.context,
  );
  const { token } = reviewLinkOf(sent[0]);
  sent.length = 0;

  const outcome = await reject(id, token);
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.publishedPlaceId, null);
  assert.equal(sent.length, 0);

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.equal(doc?.status, "rejected");
  assert.ok(!("guestEmail" in (doc ?? {})));
  assert.ok(doc?.decidedAt);
});

test("a second Publish or Reject, in either order, changes nothing and returns the first outcome", async () => {
  // Publish, then Publish again with different input, then Reject.
  const publishedId = await submit({ input: input() }, { user: aUser() });
  const publishedLink = reviewLinkOf(sent[sent.length - 1]);
  const firstOutcome = await publish(publishedId, publishedLink.token, publishInput());
  const placeCount = await Place.countDocuments();

  const secondPublish = await publish(
    publishedId,
    publishedLink.token,
    publishInput({ name: "A Different Name" }),
  );
  assert.deepEqual(secondPublish, firstOutcome);
  assert.equal(await Place.countDocuments(), placeCount);

  const rejectAfterPublish = await reject(publishedId, publishedLink.token);
  assert.deepEqual(rejectAfterPublish, firstOutcome);

  // Reject, then Reject again, then Publish.
  const rejectedId = await submit(
    { input: input({ name: "Other Place" }) },
    { user: aUser() },
  );
  const rejectedLink = reviewLinkOf(sent[sent.length - 1]);
  const rejectOutcome = await reject(rejectedId, rejectedLink.token);
  const secondReject = await reject(rejectedId, rejectedLink.token);
  assert.deepEqual(secondReject, rejectOutcome);

  const publishAfterReject = await publish(
    rejectedId,
    rejectedLink.token,
    publishInput(),
  );
  assert.deepEqual(publishAfterReject, rejectOutcome);
  assert.equal(await Place.countDocuments(), placeCount);
});

test("a bad token fails Publish and Reject the same way as every other admin operation", async () => {
  const id = await submit({ input: input() }, { user: aUser() });

  assert.equal(
    await codeOf(publish(id, "0".repeat(64), publishInput())),
    "INVALID_REVIEW_LINK",
  );
  assert.equal(
    await codeOf(reject(id, "0".repeat(64))),
    "INVALID_REVIEW_LINK",
  );
});
