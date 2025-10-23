import Place from "../../../../models/Place.js";
import mongoose from "mongoose";

export interface FavoritePlaceWithStats {
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
  averageRating: number;
  ratingCount: number;
  isFavorite: boolean;
}

/**
 * Получает все избранные места пользователя с облегчённой статистикой через агрегацию MongoDB
 * @param userId - ID пользователя для получения его избранных мест
 * @returns Объект с массивом избранных мест и общим количеством
 */
export async function getFavoritePlacesWithStats(
  userId: string,
): Promise<{ places: FavoritePlaceWithStats[]; total: number }> {
  if (!userId) {
    return { places: [], total: 0 };
  }

  // Получаем общее количество избранных мест пользователя
  const total = await Place.aggregate([
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        as: "interactions",
      },
    },
    {
      $match: {
        "interactions": {
          $elemMatch: {
            userId: new mongoose.Types.ObjectId(userId),
            isFavorite: true,
          },
        },
      },
    },
    {
      $count: "total",
    },
  ]);

  const totalCount = total.length > 0 ? total[0].total : 0;

  // Агрегация с пагинацией для избранных мест
  const places = await Place.aggregate([
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        as: "interactions",
      },
    },
    {
      $match: {
        "interactions": {
          $elemMatch: {
            userId: new mongoose.Types.ObjectId(userId),
            isFavorite: true,
          },
        },
      },
    },
    // Остальная агрегация
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
            cond: {
              $eq: [
                "$$this.userId",
                new mongoose.Types.ObjectId(userId),
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "interactions",
        localField: "_id",
        foreignField: "placeId",
        pipeline: [
          { $match: { rating: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
        ],
        as: "ratingStats",
      },
    },
    {
      $addFields: {
        averageRating: {
          $ifNull: [{ $arrayElemAt: ["$ratingStats.averageRating", 0] }, 0],
        },
        ratingCount: {
          $ifNull: [{ $arrayElemAt: ["$ratingStats.ratingCount", 0] }, 0],
        },
        isFavorite: true, // Все места в этом запросе уже избранные
      },
    },
    {
      $project: {
        interactions: 0,
        userInteractions: 0,
        ratingStats: 0,
        "properties.additionalInfo": 0,
        "properties.openingHours": 0,
        "properties.phone": 0,
        "properties.website": 0,
      },
    },
  ]);

  return { places, total: totalCount };
}
