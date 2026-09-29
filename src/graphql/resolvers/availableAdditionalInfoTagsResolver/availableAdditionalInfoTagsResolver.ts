import type { QueryResolvers } from "../../generated/types.js";
import { getAvailableAdditionalInfoTags } from "./services/additionalInfoTagsService.js";

export const availableAdditionalInfoTagsResolver: QueryResolvers["availableAdditionalInfoTags"] = async () => {
    const tags = await getAvailableAdditionalInfoTags();

    return {
        tags,
    };
};
