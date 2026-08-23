import Interaction from "../../../models/Interaction.js";
import User from "../../../models/User.js";
import Place from "../../../models/Place.js";
import { GraphQLError } from "graphql";

interface UserMap {
  [key: string]: {
    name: string;
    avatar?: string | null;
  };
}

export async function placeReviewsResolver(
  _: never,
  { placeId }: { placeId: string },
  context: { user?: { id: string } },
) {
  try {
    const interactions = await Interaction.find({ placeId })
      .sort({ date: -1 })
      .lean();
    const userIds = interactions
      .filter((interaction) => interaction.reviewText || interaction.rating)
      .map((interaction) => interaction.userId)
      .filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();

    const userMap: UserMap = users.reduce((acc: UserMap, user) => {
      acc[user._id.toString()] = {
        name: user.displayName,
        avatar: user?.avatar,
      };
      return acc;
    }, {});
    const reviews = interactions
      .filter((interaction) => interaction.reviewText || interaction.rating)
      .map((interaction) => {
        // Guest reviews carry no userId and have no User document behind them.
        const userId = interaction.userId?.toString() ?? null;

        return {
          id: interaction._id.toString(),
          text: interaction.reviewText || null,
          userId,
          userName: interaction.isGoogleReview
            ? "Google Maps User"
            : userId
              ? userMap[userId]?.name || "Unknown User"
              : "Anonymous User",
          userAvatar: userId ? userMap[userId]?.avatar || null : null,
          createdAt: interaction.date.toISOString(),
          isOwnReview:
            context.user && userId ? userId === context.user.id : false,
          userRating: interaction.rating || null,
          reviewImages: interaction.reviewImages || 0,
          isGoogleReview: interaction.isGoogleReview || false,
          characteristics: Object.entries(interaction.characteristics || {})
            .filter(([, pressed]) => !!pressed)
            .map(([key]) => key),
        };
      });

    return {
      id: placeId,
      reviews,
    };
  } catch (error) {
    console.error("Error fetching place reviews:", error);
    throw new GraphQLError("Error fetching place reviews", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
