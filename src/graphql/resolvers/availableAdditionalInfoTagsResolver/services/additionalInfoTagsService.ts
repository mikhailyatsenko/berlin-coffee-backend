import Place from "../../../../models/Place.js";
import { cache } from "../../../../utils/cache.js";

const CACHE_KEY = "additionalInfo:tags";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface AdditionalInfoTag {
    tag: string;
    category: string;
}

/**
 * Получить все уникальные теги из additionalInfo всех мест
 * Использует кэширование на 24 часа для оптимизации
 */
export async function getAvailableAdditionalInfoTags(): Promise<AdditionalInfoTag[]> {
    // Проверяем кэш
    const cachedTags = cache.get<AdditionalInfoTag[]>(CACHE_KEY);
    if (cachedTags) {
        return cachedTags;
    }


    // Используем агрегацию для получения всех уникальных тегов
    const pipeline = [
        // Получаем только поле additionalInfo
        {
            $project: {
                additionalInfo: "$properties.additionalInfo",
            },
        },
        // Фильтруем документы, где additionalInfo существует и не пустой
        {
            $match: {
                additionalInfo: { $exists: true, $ne: null },
            },
        },
    ];

    const places = await Place.aggregate(pipeline);

    // Собираем все уникальные теги
    const tagsSet = new Map<string, string>(); // Map<tag, category>

    places.forEach((place: any) => {
        if (!place.additionalInfo) return;

        // Проходим по всем категориям
        Object.entries(place.additionalInfo).forEach(([category, items]) => {
            if (!Array.isArray(items)) return;

            // Проходим по всем элементам в категории
            items.forEach((item) => {
                if (typeof item !== "object" || item === null) return;

                // Получаем ключ и значение каждого элемента
                Object.entries(item).forEach(([tag, value]) => {
                    // Добавляем только теги со значением true
                    if (value === true) {
                        tagsSet.set(tag, category);
                    }
                });
            });
        });
    });

    // Преобразуем Map в массив объектов
    const tags: AdditionalInfoTag[] = Array.from(tagsSet.entries()).map(
        ([tag, category]) => ({
            tag,
            category,
        })
    );

    // Сортируем по категории, затем по тегу
    tags.sort((a, b) => {
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
        }
        return a.tag.localeCompare(b.tag);
    });

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
