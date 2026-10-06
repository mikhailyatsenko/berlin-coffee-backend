import type { Characteristic, ShortlistId } from "../../../generated/types.js";
import Place, { VISIBLE_PLACE_MATCH } from "../../../../models/Place.js";
import mongoose from "mongoose";
import { placeStatsStages, type PlaceStats } from "../../../../utils/placeStats.js";
import { ActorRef, ownInteractionCond } from "../../../../utils/reviewActor.js";
import { amenitySpellings } from "../../../../amenities/synonyms.js";
import { SHORTLISTS } from "../../../../amenities/shortlists.js";

export interface PlaceWithStats extends PlaceStats {
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
    isFavorite: boolean;
    /** The Shortlists whose Amenities the Place has, in Shortlist order. */
    shortlistIds: ShortlistId[];
    /** The caller's own Review of the Place, absent when they have none. */
    ownReview?: {
        rating?: number | null;
        characteristics?: Partial<Record<Characteristic, boolean>> | null;
    };
}

/**
 * Динамически ищет Amenity в ЛЮБОЙ категории additionalInfo.
 * Структура additionalInfo:
 * {
 *   "Category 1": [ { "Amenity 1": true }, { "Amenity 2": true } ],
 *   "Category 2": [ { "Amenity 3": true } ],
 *   ...
 * }
 *
 * - конвертируем additionalInfo в массив пар { k, v } через $objectToArray
 * - проходим по всем категориям (v - массив объектов)
 * - внутри каждой категории ищем элемент, где поле с этим написанием === true
 */
function hasAmenity(spelling: string) {
    return {
        $gt: [
            {
                $size: {
                    $ifNull: [
                        {
                            $filter: {
                                input: { $objectToArray: "$properties.additionalInfo" },
                                as: "category",
                                cond: {
                                    $gt: [
                                        {
                                            $size: {
                                                $ifNull: [
                                                    {
                                                        $filter: {
                                                            input: "$$category.v",
                                                            as: "item",
                                                            cond: {
                                                                $eq: [
                                                                    {
                                                                        $getField: {
                                                                            field: spelling,
                                                                            input: "$$item",
                                                                        },
                                                                    },
                                                                    true,
                                                                ],
                                                            },
                                                        },
                                                    },
                                                    [],
                                                ],
                                            },
                                        },
                                        0,
                                    ],
                                },
                            },
                        },
                        [],
                    ],
                },
            },
            0,
        ],
    };
}

/** True when the Place has every Amenity in `names`, each through any of its spellings. */
function hasAllAmenities(names: readonly string[]) {
    return {
        $and: names.map((name) => ({
            $or: amenitySpellings(name).map(hasAmenity),
        })),
    };
}

export interface FilteredPlacesOptions {
    /** Best first: Average rating, then Rating count, then name. */
    sortByRating?: boolean;
    /** Caps the returned places; `total` still counts every match. */
    limit?: number;
}

export async function getFilteredPlacesWithStats(
    actor?: ActorRef,
    neighborhood?: string[],
    minRating?: number,
    additionalInfo?: string[],
    { sortByRating, limit }: FilteredPlacesOptions = {},
): Promise<{ places: PlaceWithStats[]; total: number }> {
    // Строим pipeline для агрегации
    const pipeline: mongoose.PipelineStage[] = [{ $match: VISIBLE_PLACE_MATCH }];

    // Фильтр по району (если указан) - применяем в начале
    if (neighborhood && neighborhood.length > 0) {
        pipeline.push({
            $match: {
                "properties.neighborhood": { $in: neighborhood },
            },
        });
    }
    if (additionalInfo && additionalInfo.length > 0) {
        // Каждая Amenity совпадает по любому своему написанию (OR),
        // а все выбранные Amenities должны выполняться (AND логика)
        pipeline.push({ $match: { $expr: hasAllAmenities(additionalInfo) } });
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
                        cond: ownInteractionCond(actor),
                    },
                },
            },
        },
        ...placeStatsStages(),
        {
            $addFields: {
                // One Interaction per person and Place (unique indexes)
                ownReview: {
                    $arrayElemAt: [
                        {
                            $map: {
                                input: "$userInteractions",
                                in: {
                                    rating: "$$this.rating",
                                    characteristics: "$$this.characteristics",
                                },
                            },
                        },
                        0,
                    ],
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

    // Фильтр по минимальному рейтингу, до округления (см. placeStatsStages)
    if (minRating !== undefined && minRating !== null) {
        pipeline.push({
            $match: {
                unroundedAverageRating: { $gte: minRating },
            },
        });
    }

    // Получаем общее количество после всех фильтров
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Place.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    if (sortByRating) {
        // _id last, so the order (and the cut at `limit`) is stable
        pipeline.push({
            $sort: {
                unroundedAverageRating: -1,
                ratingCount: -1,
                "properties.name": 1,
                _id: 1,
            },
        });
    }
    if (limit !== undefined) {
        pipeline.push({ $limit: limit });
    }

    // Before the projection drops additionalInfo; no rating threshold here
    pipeline.push({
        $addFields: {
            shortlistIds: {
                $concatArrays: SHORTLISTS.map(({ id, amenities }) => ({
                    $cond: [hasAllAmenities(amenities), [id], []],
                })),
            },
        },
    });

    // Добавляем финальную проекцию
    pipeline.push({
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

    // Выполняем агрегацию
    const places = await Place.aggregate(pipeline);

    return { places, total };
}

