import Place from "../../../../models/Place.js";
import { cache } from "../../../../utils/cache.js";

const CACHE_KEY = "neighborhoods:all";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Получить все уникальные neighborhoods всех мест
 * Использует кэширование на 24 часа для оптимизации
 */
export async function getAvailableNeighborhoods(): Promise<string[]> {
    // Проверяем кэш
    const cachedNeighborhoods = cache.get<string[]>(CACHE_KEY);
    if (cachedNeighborhoods) {
        return cachedNeighborhoods;
    }

    // Используем агрегацию для получения всех уникальных neighborhoods
    const pipeline: any[] = [
        // Получаем только поле neighborhood из properties
        {
            $project: {
                neighborhood: "$properties.neighborhood",
            },
        },
        // Фильтруем документы, где neighborhood существует и не пустой
        {
            $match: {
                $and: [
                    { neighborhood: { $exists: true } },
                    { neighborhood: { $ne: null } },
                    { neighborhood: { $ne: "" } },
                ],
            },
        },
        // Группируем по neighborhood и считаем количество
        {
            $group: {
                _id: "$neighborhood",
                count: { $sum: 1 },
            },
        },
        // Сортируем по названию
        {
            $sort: { _id: 1 as const },
        },
        // Проектируем результат
        {
            $project: {
                _id: 0,
                neighborhood: "$_id",
                count: 1,
            },
        },
    ];

    const results = await Place.aggregate(pipeline);

    // Извлекаем только названия neighborhoods
    const neighborhoods: string[] = results.map((r: any) => r.neighborhood);

    // Кэшируем результат на 24 часа
    cache.set(CACHE_KEY, neighborhoods, CACHE_TTL);

    return neighborhoods;
}

/**
 * Инвалидировать кэш neighborhoods
 * Вызывать при добавлении/обновлении/удалении мест
 */
export function invalidateNeighborhoodsCache(): void {
    cache.delete(CACHE_KEY);
}
