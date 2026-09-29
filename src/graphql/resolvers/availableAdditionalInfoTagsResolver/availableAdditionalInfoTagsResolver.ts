import { getAvailableAdditionalInfoTags } from "./services/additionalInfoTagsService.js";

export async function availableAdditionalInfoTagsResolver() {
    const tags = await getAvailableAdditionalInfoTags();

    return {
        tags,
    };
}
