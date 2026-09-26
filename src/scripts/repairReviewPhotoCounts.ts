import "../config/env.js";
import mongoose from "mongoose";
import { listReviewPhotoNames } from "../utils/imagekit.js";
import {
  applyPhotoCountRepairs,
  findBrokenPhotoCounts,
} from "./reviewPhotoCounts.js";

/**
 * One-off repair for Reviews whose `reviewImages` points past Photos ImageKit
 * never stored (the reserve-then-rollback upload bug, fixed in 9ce727a/0a085dd).
 * For every Review with Photos it lists 3welle/review-images/<placeId>/<reviewId>/
 * and cuts the count to the last Photo before the first missing one.
 *
 * Dry run by default — prints what would change without writing:
 *   node dist/scripts/repairReviewPhotoCounts.js
 * Write the repaired counts:
 *   node dist/scripts/repairReviewPhotoCounts.js --apply
 *
 * Only run --apply with the owner's explicit go-ahead, same as syncGooglePlaces.
 * Counts are only ever lowered; no file is touched. A Review whose count
 * changed between listing and writing is skipped and reported.
 */

const APPLY = process.argv.includes("--apply");

const repair = async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log(`Connected to MongoDB (${APPLY ? "APPLY" : "DRY RUN"})`);

  const { checked, repairs, failed } =
    await findBrokenPhotoCounts(listReviewPhotoNames);

  for (const { reviewId, placeId, stored, repaired } of repairs) {
    console.log(
      `~ Review ${reviewId} (Place ${placeId}): reviewImages ${stored} -> ${repaired}`,
    );
  }

  console.log(
    `\n${APPLY ? "Repairing" : "Would repair"} ${repairs.length} of ${checked} reviews with Photos`,
  );
  if (failed.length) {
    console.log(
      `\nListing failed, left alone:\n  ${failed.map((f) => `${f.reviewId}: ${f.message}`).join("\n  ")}`,
    );
  }

  if (APPLY) {
    const { written, changedMeanwhile } = await applyPhotoCountRepairs(repairs);
    console.log(`\nRepaired ${written.length} reviews`);
    if (changedMeanwhile.length) {
      console.log(
        `\nCount changed since listing, left alone:\n  ${changedMeanwhile.join("\n  ")}`,
      );
    }
  }

  await mongoose.disconnect();
};

repair().catch(async (error) => {
  console.error("Repair failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
