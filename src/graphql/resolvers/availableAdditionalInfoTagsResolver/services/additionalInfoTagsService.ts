import Place from "../../../../models/Place.js";
import { cache } from "../../../../utils/cache.js";

const CACHE_KEY = "additionalInfo:tags";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Получить все уникальные теги из additionalInfo всех мест
 * Использует кэширование на 24 часа для оптимизации
 */
export async function getAvailableAdditionalInfoTags(): Promise<string[]> {
    // Проверяем кэш
    const cachedTags = cache.get<string[]>(CACHE_KEY);
    if (cachedTags) {
        return cachedTags;
    }

    // Используем агрегацию MongoDB для получения уникальных тегов эффективно
    const pipeline: any[] = [
        {
            $match: {
                "properties.additionalInfo": { $exists: true, $ne: null },
            },
        },
        {
            $project: {
                additionalInfo: "$properties.additionalInfo",
            },
        },
        // Развёртываем объект additionalInfo (для каждой категории)
        {
            $project: {
                items: { $objectToArray: "$additionalInfo" },
            },
        },
        {
            $unwind: "$items",
        },
        // Развёртываем массив элементов в каждой категории
        {
            $unwind: "$items.v",
        },
        // Развёртываем теги в каждом элементе
        {
            $project: {
                tags: { $objectToArray: "$items.v" },
            },
        },
        {
            $unwind: "$tags",
        },
        // Фильтруем только теги со значением true
        {
            $match: {
                "tags.v": true,
            },
        },
        // Группируем по названию тега и удаляем дубликаты
        {
            $group: {
                _id: "$tags.k",
            },
        },
        // Сортируем
        {
            $sort: {
                _id: 1,
            },
        },
    ];

    const result = await Place.aggregate(pipeline);
    const tags = result.map((doc: any) => doc._id);

    // Кэшируем результат на 24 часа
    cache.set(CACHE_KEY, tags, CACHE_TTL);

    return tags;
}

/**
 * Инвалидировать кэш тегов
 * Вызывать при добавлении/обновлении/удалении мест
 */
export function invalidateAdditionalInfoTagsCache(): void {
    cache.delete(CACHE_KEY);
}
