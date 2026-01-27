import { GraphQLError } from "graphql";
import { getAvailableAdditionalInfoTags } from "./services/additionalInfoTagsService.js";

export async function availableAdditionalInfoTagsResolver() {
    try {
        const tags = await getAvailableAdditionalInfoTags();

        return {
            tags,
        };
    } catch (error) {
        console.error("Error fetching available additionalInfo tags:", error);
        throw new GraphQLError("Error fetching available additionalInfo tags", {
            extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error instanceof Error ? error.message : String(error),
            },
        });
    }
}
