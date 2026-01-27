import Place from "../../../../models/Place.js";
import mongoose from "mongoose";

export interface PlaceWithStats {
    _id: mongoose.Types.ObjectId;
    type: string;
    geometry: {
        type: string;
        coordinates: [number, number];
    };
    properties: {
        name: string;
        slug: string;
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

export async function getFilteredPlacesWithStats(
    userId?: string,
    neighborhood?: string[],
    minRating?: number,
    additionalInfo?: string[],
): Promise<{ places: PlaceWithStats[]; total: number }> {
    // Строим pipeline для агрегации
    const pipeline: mongoose.PipelineStage[] = [];

    // Фильтр по району (если указан) - применяем в начале
    if (neighborhood && neighborhood.length > 0) {
        pipeline.push({
            $match: {
                "properties.neighborhood": { $in: neighborhood },
            },
        });
    }

   
    if (additionalInfo && additionalInfo.length > 0) {
      //TODO: check if all possible values checking in map
        const additionalInfoConditions = additionalInfo.map((value) => ({
            $or: [
                {
                    [`properties.additionalInfo.Service options`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Highlights`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Popular for`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Accessibility`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Offerings`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Dining options`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Amenities`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Atmosphere`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Crowd`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Planning`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Payments`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Children`]: {
                        $elemMatch: { [value]: true },
                    },
                },
                {
                    [`properties.additionalInfo.Parking`]: {
                        $elemMatch: { [value]: true },
                    },
                },
            ],
        }));

        // Все условия должны выполняться (AND логика)
        pipeline.push({
            $match: {
                $and: additionalInfoConditions,
            },
        });
    }

    // Получаем взаимодействия и статистику рейтингов
    pipeline.push(
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
                        cond: {
                            $eq: [
                                "$$this.userId",
                                userId ? new mongoose.Types.ObjectId(userId) : null,
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
    );

    // Фильтр по минимальному рейтингу (применяем после вычисления averageRating)
    if (minRating !== undefined && minRating !== null) {
        pipeline.push({
            $match: {
                averageRating: { $gte: minRating },
            },
        });
    }

    // Получаем общее количество после всех фильтров
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Place.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Добавляем финальную проекцию
    pipeline.push({
        $project: {
            interactions: 0,
            userInteractions: 0,
            ratingStats: 0,
            "properties.additionalInfo": 0,
            "properties.openingHours": 0,
            "properties.phone": 0,
            "properties.website": 0,
        },
    });

    // Выполняем агрегацию
    const places = await Place.aggregate(pipeline);

    return { places, total };
}

