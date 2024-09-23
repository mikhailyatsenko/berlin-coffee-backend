import { GraphQLError } from "graphql";
import User from "../../../models/User.js"; // Импорт модели пользователя
import Interaction from "../../../models/Interaction.js"; // Импорт модели взаимодействий
import Place from "../../../models/Place.js"; // Импорт модели места

export async function getUserProfileResolver(
  _: never,
  { userId }: { userId: string },
) {
  try {
    // Находим пользователя по userId
    const user = await User.findById(userId);

    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: {
          code: "NOT_FOUND",
        },
      });
    }

    // Получаем все взаимодействия пользователя
    const interactions = await Interaction.find({ userId: user._id });

    const reviewedPlaceIds = interactions
      .filter((interaction) => interaction.rating !== undefined)
      .map((interaction) => interaction.placeId);

    const reviewedPlaces = await Place.find(
      { _id: { $in: reviewedPlaceIds } },
      { _id: 1, properties: { name: 1 } },
    );

    return {
      id: user.id,
      name: user.displayName,
      avatar: user.avatar,
      email: user.email,
      reviewedLocations: reviewedPlaces.map((place) => ({
        id: place._id,
        name: place.properties.name,
      })),
    };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw new GraphQLError("Error fetching user profile", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
