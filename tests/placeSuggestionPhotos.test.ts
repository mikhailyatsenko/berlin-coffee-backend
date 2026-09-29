/**
 * Place suggestion photos: uploading them, Publish moving the kept ones into
 * the Place's own folder and setting the card image, and Reject deleting them
 * all — against a throwaway mongod and a fake ImageKit bucket, as in
 * tests/uploadReviewImage.test.ts.
 *
 * Run: npm test
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import sharp from "sharp";
import type { Request } from "express";
import type { IUser } from "../src/models/User.js";
import type { GuestContext } from "../src/utils/guestAuth.js";
import { setTestEnv, useThrowawayMongod } from "./support/mongod.js";
import { clientCode } from "./support/clientCode.js";

setTestEnv();

const { MailerSend } = await import("mailersend");
const { default: ImageKit } = await import("imagekit");
const { default: PlaceSuggestion } = await import(
  "../src/models/PlaceSuggestion.js"
);
const { default: Place } = await import("../src/models/Place.js");
const { createGuestIdentity } = await import("../src/utils/guestAuth.js");
const { countRateLimit } = await import("../src/utils/rateLimit.js");
const { signReviewToken } = await import(
  "../src/utils/placeSuggestionToken.js"
);
const { submitPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/submitPlaceSuggestionResolver.js"
);
const { placeSuggestionForReviewResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/placeSuggestionForReviewResolver.js"
);
const { uploadPlaceSuggestionPhotoResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/uploadPlaceSuggestionPhotoResolver.js"
);
const { uploadPlaceSuggestionPhotoAsAdminResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/uploadPlaceSuggestionPhotoAsAdminResolver.js"
);
const { deletePlaceSuggestionPhotoResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/deletePlaceSuggestionPhotoResolver.js"
);
const { publishPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/publishPlaceSuggestionResolver.js"
);
const { rejectPlaceSuggestionResolver } = await import(
  "../src/graphql/resolvers/placeSuggestionResolver/rejectPlaceSuggestionResolver.js"
);
import { callResolver } from "./support/callResolver.js";

// --- fake MailerSend: submit fires an admin email; the send itself does not
// matter to these tests, only that it never reaches the network. -----------

(
  Object.getPrototypeOf(new MailerSend({ apiKey: "test" }).email) as {
    send: (...args: unknown[]) => Promise<unknown>;
  }
).send = async () => ({});

// --- fake ImageKit bucket ---------------------------------------------------

const bucket = new Map<string, Buffer>();
let uploadFails = false;
let copyFails = false;
/** Fails copyFile for these specific source paths only, leaving others to succeed. */
const failingCopySources = new Set<string>();

type UploadOpts = { file: Buffer; fileName: string; folder: string };
(
  ImageKit.prototype as unknown as {
    upload: (o: UploadOpts) => Promise<{ filePath: string }>;
  }
).upload = async (opts) => {
  if (uploadFails) throw new Error("ImageKit 500");
  const filePath = `/${opts.folder}/${opts.fileName}`;
  bucket.set(filePath, opts.file);
  return { filePath };
};

type CopyOpts = { sourceFilePath: string; destinationPath: string };
(
  ImageKit.prototype as unknown as {
    copyFile: (o: CopyOpts) => Promise<void>;
  }
).copyFile = async ({ sourceFilePath, destinationPath }) => {
  if (copyFails || failingCopySources.has(sourceFilePath)) {
    throw new Error("ImageKit 500");
  }
  const content = bucket.get(sourceFilePath);
  if (!content) throw new Error(`copyFile: ${sourceFilePath} not found`);
  const fileName = sourceFilePath.slice(sourceFilePath.lastIndexOf("/") + 1);
  bucket.set(`${destinationPath}/${fileName}`, content);
};

type RenameOpts = { filePath: string; newFileName: string };
(
  ImageKit.prototype as unknown as {
    renameFile: (o: RenameOpts) => Promise<Record<string, never>>;
  }
).renameFile = async ({ filePath, newFileName }) => {
  const content = bucket.get(filePath);
  if (!content) throw new Error(`renameFile: ${filePath} not found`);
  const folder = filePath.slice(0, filePath.lastIndexOf("/"));
  bucket.delete(filePath);
  bucket.set(`${folder}/${newFileName}`, content);
  return {};
};

(
  ImageKit.prototype as unknown as {
    deleteFolder: (folderPath: string) => Promise<void>;
  }
).deleteFolder = async (folderPath) => {
  const prefix = folderPath.startsWith("/") ? folderPath : `/${folderPath}`;
  for (const key of [...bucket.keys()]) {
    if (key.startsWith(`${prefix}/`)) bucket.delete(key);
  }
};

// listFiles/deleteFile: the fake bucket's keys already are the file paths, so
// fileId is just the filePath itself.
type ListFilesOpts = { path: string };
(
  ImageKit.prototype as unknown as {
    listFiles: (
      o: ListFilesOpts,
    ) => Promise<{ type: "file"; filePath: string; fileId: string }[]>;
  }
).listFiles = async ({ path }) => {
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return [...bucket.keys()]
    .filter((key) => key.startsWith(`${prefix}/`))
    .map((key) => ({ type: "file" as const, filePath: key, fileId: key }));
};

(
  ImageKit.prototype as unknown as {
    deleteFile: (fileId: string) => Promise<void>;
  }
).deleteFile = async (fileId) => {
  bucket.delete(fileId);
};

// --- mongod ------------------------------------------------------------

useThrowawayMongod();

beforeEach(async () => {
  bucket.clear();
  uploadFails = false;
  copyFails = false;
  failingCopySources.clear();
  await PlaceSuggestion.deleteMany({});
  await Place.deleteMany({});
});

// --- helpers -----------------------------------------------------------

let ipCounter = 0;
const freshReq = () => ({ ip: `10.1.0.${++ipCounter}` }) as Request;

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

const submit = (context: { user?: IUser | null; guest?: GuestContext }) =>
  callResolver(submitPlaceSuggestionResolver, { input: { name: "Bonanza Coffee", address: "Oderberger Str. 35" } },
    { req: freshReq(), ...context } as never,
  );

/** Creates a pending suggestion and returns its id and review token. */
async function aSuggestion(context: {
  user?: IUser | null;
  guest?: GuestContext;
}) {
  const id = await submit(context);
  return { id, token: signReviewToken(id) };
}

const png = (await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#888" },
})
  .png()
  .toBuffer()
  .then((b) => b.toString("base64"))) as string;

const uploadPhoto = (
  suggestionId: string,
  context: { user?: IUser | null; guest?: GuestContext; req?: Request } = {},
) =>
  callResolver(uploadPlaceSuggestionPhotoResolver, { suggestionId, fileBuffer: png },
    { req: freshReq(), ...context } as never,
  );

const review = (id: string, token: string) =>
  callResolver(placeSuggestionForReviewResolver, { id, token });

const uploadPhotoAsAdmin = (id: string, token: string) =>
  callResolver(uploadPlaceSuggestionPhotoAsAdminResolver, {
    id,
    token,
    fileBuffer: png,
  });

const deletePhoto = (id: string, token: string, path: string) =>
  callResolver(deletePlaceSuggestionPhotoResolver, { id, token, path });

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
  callResolver(publishPlaceSuggestionResolver, { id, token, input });

const reject = (id: string, token: string) =>
  callResolver(rejectPlaceSuggestionResolver, { id, token });

/** The code the client sees for the rejection, after formatError. */
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return clientCode(e);
  }
  assert.fail("expected the call to be rejected");
};

// --- tests: upload -------------------------------------------------------

test("only the suggester can upload; a stranger is rejected", async () => {
  const owner = aUser();
  const { id } = await aSuggestion({ user: owner });

  assert.equal(
    await codeOf(uploadPhoto(id, { user: aUser() })),
    "FORBIDDEN",
  );
  assert.equal(
    await codeOf(uploadPhoto(id, (await aGuest()).context)),
    "FORBIDDEN",
  );

  const result = await uploadPhoto(id, { user: owner });
  assert.equal(result.photoCount, 1);
});

test("a decided suggestion rejects uploads", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  await reject(id, token);

  assert.equal(
    await codeOf(uploadPhoto(id, { user: owner })),
    "FORBIDDEN",
  );
});

test("an 11th photo is rejected, and the 10th is still stored", async () => {
  const owner = aUser();
  const { id } = await aSuggestion({ user: owner });

  for (let i = 1; i <= 10; i++) {
    const result = await uploadPhoto(id, { user: owner });
    assert.equal(result.photoCount, i);
  }

  assert.equal(
    await codeOf(uploadPhoto(id, { user: owner })),
    "IMAGE_LIMIT_REACHED",
  );

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.equal(doc?.photos.length, 10);
});

test("a Guest upload counts towards the existing Guest photo limit", async () => {
  const guest = await aGuest();
  const { id } = await aSuggestion(guest.context);
  const ip = "10.9.9.9";

  // Exhaust the shared guestPhoto bucket (20/hour) with something else first.
  for (let i = 0; i < 20; i++) countRateLimit("guestPhoto", ip);

  assert.equal(
    await codeOf(uploadPhoto(id, { ...guest.context, req: { ip } as Request })),
    "RATE_LIMITED",
  );

  // A User's upload never touches that bucket.
  const owner = aUser();
  const { id: userSuggestionId } = await aSuggestion({ user: owner });
  const result = await uploadPhoto(userSuggestionId, {
    user: owner,
    req: { ip } as Request,
  });
  assert.equal(result.photoCount, 1);
});

// --- tests: admin upload / delete ------------------------------------------

test("an admin upload is stored, returns its path, and shows up in placeSuggestionForReview", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });

  const path = await uploadPhotoAsAdmin(id, token);
  assert.equal(typeof path, "string");

  const opened = await review(id, token);
  assert.deepEqual(opened.photos, [path]);
});

test("the shared 10-photo cap refuses an 11th photo, from the suggester or the admin", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });

  for (let i = 0; i < 5; i++) await uploadPhoto(id, { user: owner });
  for (let i = 0; i < 5; i++) await uploadPhotoAsAdmin(id, token);

  assert.equal(
    await codeOf(uploadPhoto(id, { user: owner })),
    "IMAGE_LIMIT_REACHED",
  );
  assert.equal(
    await codeOf(uploadPhotoAsAdmin(id, token)),
    "IMAGE_LIMIT_REACHED",
  );

  const doc = await PlaceSuggestion.findById(id).lean();
  assert.equal(doc?.photos.length, 10);
});

test("delete removes the path and the file, and frees a slot for a new upload", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  for (let i = 0; i < 10; i++) await uploadPhotoAsAdmin(id, token);
  const opened = await review(id, token);
  const [toDelete] = opened.photos;

  const result = await deletePhoto(id, token, toDelete);
  assert.equal(result, true);
  assert.ok(!bucket.has(toDelete));

  const afterDelete = await review(id, token);
  assert.equal(afterDelete.photos.length, 9);
  assert.ok(!afterDelete.photos.includes(toDelete));

  const newPath = await uploadPhotoAsAdmin(id, token);
  assert.equal((await review(id, token)).photos.length, 10);
  assert.notEqual(newPath, toDelete);
});

test("deleting a path that is already gone still succeeds", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  const path = await uploadPhotoAsAdmin(id, token);

  assert.equal(await deletePhoto(id, token, path), true);
  assert.equal(await deletePhoto(id, token, path), true);
  assert.equal((await review(id, token)).photos.length, 0);
});

test("delete refuses a path from another suggestion", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  const other = await aSuggestion({ user: aUser() });
  const otherPath = await uploadPhotoAsAdmin(other.id, other.token);

  assert.equal(
    await codeOf(deletePhoto(id, token, otherPath)),
    "BAD_USER_INPUT",
  );
  assert.ok(bucket.has(otherPath), "the other suggestion's photo is untouched");
});

test("a bad token and a decided suggestion are refused by both admin photo operations", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  const path = await uploadPhotoAsAdmin(id, token);

  const badToken = "0".repeat(64);
  assert.equal(
    await codeOf(uploadPhotoAsAdmin(id, badToken)),
    "INVALID_REVIEW_LINK",
  );
  assert.equal(
    await codeOf(deletePhoto(id, badToken, path)),
    "INVALID_REVIEW_LINK",
  );

  await reject(id, token);
  assert.equal(
    await codeOf(uploadPhotoAsAdmin(id, token)),
    "FORBIDDEN",
  );
  assert.equal(
    await codeOf(deletePhoto(id, token, path)),
    "FORBIDDEN",
  );
});

test("admin uploads don't consume the guestPhoto rate limit", async () => {
  const guest = await aGuest();
  const { id, token } = await aSuggestion(guest.context);
  const ip = "10.8.8.8";

  for (let i = 0; i < 20; i++) countRateLimit("guestPhoto", ip);

  // The admin path takes no `req`/guest context at all, so it cannot touch
  // the exhausted bucket above.
  const path = await uploadPhotoAsAdmin(id, token);
  assert.equal(typeof path, "string");
});

test("Publish with a list that includes admin photos makes them Place photos, the first one the card image", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  await uploadPhoto(id, { user: owner });
  const adminPath = await uploadPhotoAsAdmin(id, token);

  const opened = await review(id, token);
  assert.deepEqual(opened.photos.length, 2);

  const outcome = await publish(
    id,
    token,
    publishInput({ photoPaths: [adminPath, opened.photos[0]] }),
  );
  const placeId = outcome.publishedPlaceId!;

  const place = await Place.findById(placeId).lean();
  assert.equal(
    place?.properties.image,
    `/places-main-img/${placeId}/main.jpg`,
  );
  assert.ok(bucket.has(`places-main-img/${placeId}/main.jpg`));
});

// --- tests: publish / reject ----------------------------------------------

test("Publish moves the kept photos, sets the card image to the first kept, and deletes the dropped ones", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });

  await uploadPhoto(id, { user: owner }); // dropped
  await uploadPhoto(id, { user: owner }); // kept, becomes the card image
  await uploadPhoto(id, { user: owner }); // kept

  const opened = await review(id, token);
  const [dropped, firstKept, secondKept] = opened.photos;
  assert.equal(opened.photos.length, 3);

  const outcome = await publish(
    id,
    token,
    publishInput({ photoPaths: [firstKept, secondKept] }),
  );
  const placeId = outcome.publishedPlaceId!;

  const place = await Place.findById(placeId).lean();
  assert.equal(
    place?.properties.image,
    `/places-main-img/${placeId}/main.jpg`,
  );
  assert.ok(bucket.has(`places-main-img/${placeId}/main.jpg`));

  const secondKeptName = secondKept.slice(secondKept.lastIndexOf("/") + 1);
  assert.ok(bucket.has(`places-main-img/${placeId}/${secondKeptName}`));

  // The dropped photo, and the moved ones' old locations, are gone.
  assert.ok(!bucket.has(dropped));
  assert.ok(!bucket.has(firstKept));
  assert.ok(!bucket.has(secondKept));
  assert.equal(bucket.size, 2);
});

test("Publish with no kept photos leaves the default image", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  await uploadPhoto(id, { user: owner });
  await uploadPhoto(id, { user: owner });

  const outcome = await publish(id, token, publishInput({ photoPaths: [] }));

  const place = await Place.findById(outcome.publishedPlaceId).lean();
  assert.equal(place?.properties.image, "");
  assert.equal(bucket.size, 0, "the dropped photos are all deleted");
});

test("photoPaths from another suggestion are rejected", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  const otherOwner = aUser();
  const other = await aSuggestion({ user: otherOwner });
  await uploadPhoto(other.id, { user: otherOwner });
  const otherOpened = await review(other.id, other.token);

  assert.equal(
    await codeOf(
      publish(id, token, publishInput({ photoPaths: otherOpened.photos })),
    ),
    "BAD_USER_INPUT",
  );
  assert.equal((await PlaceSuggestion.findById(id))?.status, "pending");
  assert.equal(await Place.countDocuments(), 0);
});

test("an ImageKit failure while copying photos fails Publish before anything is created or marked", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  await uploadPhoto(id, { user: owner });
  const opened = await review(id, token);

  copyFails = true;
  assert.equal(
    await codeOf(
      publish(id, token, publishInput({ photoPaths: opened.photos })),
    ),
    "INTERNAL_SERVER_ERROR",
  );

  assert.equal(await Place.countDocuments(), 0);
  assert.equal((await PlaceSuggestion.findById(id))?.status, "pending");

  // A retry after the failure clears works normally.
  copyFails = false;
  const outcome = await publish(
    id,
    token,
    publishInput({ photoPaths: opened.photos }),
  );
  assert.equal(outcome.status, "published");
  assert.equal(await Place.countDocuments(), 1);
});

test("one photo failing to copy leaves the others' originals untouched, so a retry can still publish all of them", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  await uploadPhoto(id, { user: owner });
  await uploadPhoto(id, { user: owner });
  const opened = await review(id, token);
  const [first, second] = opened.photos;

  // The first photo's copy succeeds; the second's fails — unlike a move, this
  // must not strand the first with no original to retry from.
  failingCopySources.add(second);
  assert.equal(
    await codeOf(publish(id, token, publishInput({ photoPaths: [first, second] }))),
    "INTERNAL_SERVER_ERROR",
  );
  assert.equal(await Place.countDocuments(), 0);
  assert.ok(bucket.has(first), "the first photo's original must survive the partial failure");
  assert.ok(bucket.has(second));

  failingCopySources.clear();
  const outcome = await publish(
    id,
    token,
    publishInput({ photoPaths: [first, second] }),
  );
  assert.equal(outcome.status, "published");
  const placeId = outcome.publishedPlaceId!;
  assert.ok(bucket.has(`places-main-img/${placeId}/main.jpg`));
  const secondName = second.slice(second.lastIndexOf("/") + 1);
  assert.ok(bucket.has(`places-main-img/${placeId}/${secondName}`));
});

test("Reject deletes every photo of the suggestion", async () => {
  const owner = aUser();
  const { id, token } = await aSuggestion({ user: owner });
  const first = await uploadPhoto(id, { user: owner });
  await uploadPhoto(id, { user: owner });
  assert.equal(first.photoCount, 1);
  assert.equal(bucket.size, 2);

  await reject(id, token);

  assert.equal(bucket.size, 0);
});
