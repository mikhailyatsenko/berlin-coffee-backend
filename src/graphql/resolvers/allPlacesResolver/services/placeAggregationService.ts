import Place, { VISIBLE_PLACE_MATCH } from "../../../../models/Place.js";
import mongoose from "mongoose";
import { placeStatsStages, type PlaceStats } from "../../../../utils/placeStats.js";
import { ActorRef, ownInteractionCond } from "../../../../utils/reviewActor.js";

export interface PlaceWithStats extends PlaceStats {
  _id: mongoose.Types.ObjectId;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    description: string;
    address: string;
    image: string;
    instagram: string;
    googleId?: string | null;
    neighborhood?: string;
  };
  favoriteCount: number;
  isFavorite: boolean;
}

/**
 * Получает места с облегчённой статистикой через агрегацию MongoDB
 * @param actor - Пользователь или гость, чьи взаимодействия нужно отметить
 * @param limit - Количество записей для возврата
 * @param offset - Смещение (пропуск) записей
 * @returns Объект с массивом мест и общим количеством
 */
export async function getPlacesWithStats(
  actor?: ActorRef,
  limit?: number,
  offset: number = 0,
): Promise<{ places: PlaceWithStats[]; total: number }> {
  // Get the total number of places
  const total = await Place.countDocuments(VISIBLE_PLACE_MATCH);

  // Агрегация с пагинацией
  // Calculate rating, sort, then apply pagination
  const aggregationPipeline: mongoose.PipelineStage[] = [
    { $match: VISIBLE_PLACE_MATCH },
    // Calculate statistics by interactions
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        as: "interactions",
      },
    },
    {
      $addFields: {
        favoriteCount: {
          $size: {
            $filter: {
              input: "$interactions",
              cond: { $eq: ["$$this.isFavorite", true] },
            },
          },
        },
        userInteractions: {
          $filter: {
            input: "$interactions",
            cond: ownInteractionCond(actor),
          },
        },
      },
    },
    ...placeStatsStages(),
    {
      $addFields: {
        isFavorite: {
          $cond: {
            if: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$userInteractions",
                      cond: { $eq: ["$$this.isFavorite", true] },
                    },
                  },
                },
                0,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    // Sort by rating from highest to lowest
    {
      $sort: { unroundedAverageRating: -1 },
    },
    // Apply pagination after sorting
    { $skip: offset },
  ];

  if (typeof limit === "number") {
    aggregationPipeline.push({ $limit: limit });
  }

  aggregationPipeline.push({
    $project: {
      interactions: 0,
      userInteractions: 0,
      unroundedAverageRating: 0,
      "properties.additionalInfo": 0,
      "properties.openingHours": 0,
      "properties.phone": 0,
      "properties.website": 0,
    },
  });

  const places = await Place.aggregate(aggregationPipeline);

  return { places, total };
}