import mongoose from "mongoose";
import Interaction from "../models/Interaction.js";

/**
 * A Place's Average rating and Rating count, computed from its Interactions on
 * every read (nothing is stored on the Place). The only code that aggregates
 * Ratings: every query and mutation returning them goes through here, so one
 * Place shows the same numbers whichever of them loaded it.
 */
export interface PlaceStats {
  /** The mean of the Place's Ratings, Google reviews included, rounded half up to one decimal; 0 without Ratings. */
  averageRating: number;
  ratingCount: number;
}

/**
 * Runs over one Place's Interactions and yields its stats, plus the mean
 * before rounding, or nothing when it has no Ratings. A Review without a
 * Rating, and the empty document `deleteAll` leaves, don't count.
 *
 * The rounding is done in integers from the sum and count: `$round` rounds
 * half to even, and a float mean such as 4.15 can land on either side of .x5.
 * round(10 · sum / n) half up = floor((20 · sum + n) / 2n).
 */
const statsOfInteractions: mongoose.PipelineStage.FacetPipelineStage[] = [
  { $match: { rating: { $exists: true, $ne: null } } },
  {
    $group: {
      _id: null,
      ratingSum: { $sum: "$rating" },
      ratingCount: { $sum: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      ratingCount: 1,
      unroundedAverageRating: { $divide: ["$ratingSum", "$ratingCount"] },
      averageRating: {
        $divide: [
          {
            $floor: {
              $divide: [
                { $add: [{ $multiply: ["$ratingSum", 20] }, "$ratingCount"] },
                { $multiply: ["$ratingCount", 2] },
              ],
            },
          },
          10,
        ],
      },
    },
  },
];

/**
 * Pipeline stages that add `averageRating` and `ratingCount` to each document,
 * for queries over many Places, whose `_id` is the Place's id.
 *
 * They also add `unroundedAverageRating`, for sorting and for a `minRating`
 * threshold: a Place at 3.96 shows 4.0 but stays under `minRating: 4`, so a
 * Shortlist's total and `filteredPlaces` agree. Project it away before
 * returning.
 */
export function placeStatsStages(): mongoose.PipelineStage[] {
  return [
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        pipeline: statsOfInteractions,
        as: "placeStats",
      },
    },
    {
      $addFields: {
        averageRating: {
          $ifNull: [{ $arrayElemAt: ["$placeStats.averageRating", 0] }, 0],
        },
        ratingCount: {
          $ifNull: [{ $arrayElemAt: ["$placeStats.ratingCount", 0] }, 0],
        },
        unroundedAverageRating: {
          $ifNull: [
            { $arrayElemAt: ["$placeStats.unroundedAverageRating", 0] },
            0,
          ],
        },
      },
    },
    { $project: { placeStats: 0 } },
  ];
}

/** The stats of one Place, for mutations that return them after a write. */
export async function getPlaceStats(
  placeId: string | mongoose.Types.ObjectId,
): Promise<PlaceStats> {
  const [stats] = await Interaction.aggregate<PlaceStats>([
    { $match: { placeId: new mongoose.Types.ObjectId(placeId) } },
    ...statsOfInteractions,
    { $project: { unroundedAverageRating: 0 } },
  ]);
  return stats ?? { averageRating: 0, ratingCount: 0 };
}
