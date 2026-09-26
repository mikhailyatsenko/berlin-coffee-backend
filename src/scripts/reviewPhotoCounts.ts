import Interaction from "../models/Interaction.js";

/**
 * Finds and repairs Reviews whose Photo count (`reviewImages`) points past
 * files ImageKit never stored, left behind by the upload bug fixed in
 * 9ce727a/0a085dd. Run through repairReviewPhotoCounts.ts.
 */

/** File names in one Review's Photo folder; throws when the listing fails. */
export type ListReviewPhotoNames = (
  placeId: string,
  reviewId: string,
) => Promise<string[]>;

export interface PhotoCountRepair {
  reviewId: string;
  placeId: string;
  stored: number;
  repaired: number;
}

/**
 * The largest N with image_1.jpg .. image_N.jpg all present, capped at the
 * stored count. The client renders image_1..image_<reviewImages>, so a gap
 * cuts the count there even if later files exist; files past the stored count
 * are uploads that were never counted and stay uncounted.
 */
const safePhotoCount = (fileNames: string[], stored: number) => {
  const present = new Set(fileNames);
  let count = 0;
  while (count < stored && present.has(`image_${count + 1}.jpg`)) count++;
  return count;
};

export async function findBrokenPhotoCounts(
  listPhotoNames: ListReviewPhotoNames,
) {
  const reviews = await Interaction.find({ reviewImages: { $gt: 0 } })
    .select("placeId reviewImages")
    .sort({ _id: 1 })
    .lean();

  const repairs: PhotoCountRepair[] = [];
  const failed: { reviewId: string; message: string }[] = [];

  // One at a time: ImageKit rate-limits, and this runs once.
  for (const review of reviews) {
    const reviewId = review._id.toString();
    const placeId = review.placeId.toString();
    const stored = review.reviewImages!;

    let fileNames: string[];
    try {
      fileNames = await listPhotoNames(placeId, reviewId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ reviewId, message });
      continue;
    }

    const repaired = safePhotoCount(fileNames, stored);
    if (repaired !== stored)
      repairs.push({ reviewId, placeId, stored, repaired });
  }

  return { checked: reviews.length, repairs, failed };
}

/**
 * Writes each repaired count, but only while the stored count is still the
 * one the repair was computed from: a Review whose Photos changed since
 * (an upload committed, deleteReview cleared them) is left alone.
 */
export async function applyPhotoCountRepairs(repairs: PhotoCountRepair[]) {
  const written: string[] = [];
  const changedMeanwhile: string[] = [];

  for (const { reviewId, stored, repaired } of repairs) {
    const result = await Interaction.updateOne(
      { _id: reviewId, reviewImages: stored },
      { $set: { reviewImages: repaired } },
    );
    (result.modifiedCount === 1 ? written : changedMeanwhile).push(reviewId);
  }

  return { written, changedMeanwhile };
}
