import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import User from "../../../models/User.js";
import { IUser } from "../../../models/User.js";

interface UserMap {
  [key: string]: {
    name: string;
    avatar: string;
  };
}

export async function placeReviewsResolver(
  _: never,
  { placeId }: { placeId: string },
  context: { user?: IUser },
) {
  try {
    const reviews = await Interaction.find({
      placeId,
      $or: [
        { review: { $exists: true, $ne: null } },
        { rating: { $exists: true, $ne: null } },
      ],
    })
      .sort({ date: -1 })
      .lean();

    const userIds = reviews.map((review) => review.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();

    const userMap: UserMap = users.reduce((acc: UserMap, user) => {
      acc[user._id.toString()] = {
        name: user.displayName,
        avatar: user.avatar,
      };
      return acc;
    }, {});
    return reviews.map((review) => ({
      id: review._id.toString(),
      text: review.review,
      userId: review.userId.toString(),
      userName: userMap[review.userId.toString()].name || "Unknown User",
      userRating: review.rating || null,
      userAvatar: userMap[review.userId.toString()]?.avatar || "",
      createdAt: review.date.toISOString(),
      placeId: review.placeId.toString(),
      isOwnReview: context.user
        ? review.userId.toString() === context.user.id
        : false,
    }));
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
