import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import User from "../../../models/User.js";
import { IUser } from "../../../models/User.js";

interface UserMap {
  [key: string]: string;
}

export async function placeReviewsResolver(
  _: never,
  { placeId }: { placeId: string },
  context: { user?: IUser },
) {
  try {
    const reviews = await Interaction.find({
      placeId,
      review: { $exists: true, $ne: null },
    })
      .sort({ date: -1 })
      .lean();

    const userIds = reviews.map((review) => review.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();

    const userMap: UserMap = users.reduce((acc: UserMap, user) => {
      if (user._id) {
        acc[user._id.toString()] = user.displayName;
      }
      return acc;
    }, {});

    return reviews.map((review) => ({
      id: review._id.toString(),
      text: review.review,
      userId: review.userId.toString(),
      userName: userMap[review.userId.toString()] || "Unknown User",
      placeId: review.placeId.toString(),
      createdAt: review.date.toISOString(),
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
