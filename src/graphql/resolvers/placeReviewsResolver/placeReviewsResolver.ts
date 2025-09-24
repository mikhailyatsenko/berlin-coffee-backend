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
      .map((interaction) => interaction.userId);
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
      .map((interaction) => ({
        id: interaction._id.toString(),
        text: interaction.reviewText || null,
        userId: interaction.userId.toString(),
        userName:
          interaction.userId.toString() === "000000000000000000000000"
            ? "Google Maps User"
            : userMap[interaction.userId.toString()]?.name || "Unknown User",
        userAvatar: userMap[interaction.userId.toString()]?.avatar || null,
        createdAt: interaction.date.toISOString(),
        isOwnReview: context.user
          ? interaction.userId.toString() === context.user.id
          : false,
        userRating: interaction.rating || null,
        imgCount: 0,
      }));

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
