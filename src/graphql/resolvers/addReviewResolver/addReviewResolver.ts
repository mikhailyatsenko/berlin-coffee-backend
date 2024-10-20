import Interaction, { IInteraction } from "../../../models/Interaction.js";
import User from "../../../models/User.js";
import Place from "../../../models/Place.js";
import { GraphQLError } from "graphql";
import mongoose from "mongoose";
import { IUser } from "src/models/User.js";

interface UserMap {
  [key: string]: {
    name: string;
    avatar: string;
  };
}

export async function addReviewResolver(
  _: never,
  {
    placeId,
    text,
    rating,
  }: { placeId: string; text?: string; rating?: number },
  { user }: { user: IUser },
) {
  if (!user) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        requiresLogin: true,
      },
    });
  }
  try {
    const place = await Place.findById(placeId);
    if (!place) {
      throw new GraphQLError("Place not found");
    }

    let interaction:
      | (mongoose.FlattenMaps<IInteraction> & { _id: mongoose.Types.ObjectId })
      | null = await Interaction.findOne({ userId: user.id, placeId }).lean();

    const updateData: Partial<IInteraction> = { date: new Date() };
    if (rating !== undefined) updateData.rating = rating;
    if (text !== undefined) updateData.review = text;

    if (interaction) {
      interaction = await Interaction.findOneAndUpdate(
        { userId: user.id, placeId },
        { $set: updateData },
        { new: true, lean: true },
      );
    } else {
      const newInteraction = await Interaction.create({
        userId: user.id,
        placeId,
        ...updateData,
      });
      interaction = newInteraction.toObject();
    }

    if (!interaction) {
      throw new GraphQLError("Failed to create or update interaction");
    }

    const aggregationResult = await Interaction.aggregate([
      {
        $match: {
          placeId: new mongoose.Types.ObjectId(placeId),
          rating: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          ratingCount: { $sum: 1 },
        },
      },
    ]);

    const stats = aggregationResult[0] || { averageRating: 0, ratingCount: 0 };

    const userDoc = await User.findById(user.id).lean();
    const userMap: UserMap = {
      [user.id]: {
        name: userDoc?.displayName || "Unknown User",
        avatar: userDoc?.avatar || "",
      },
    };

    const review = {
      id: interaction._id.toString(),
      text: interaction.review || "",
      userId: interaction.userId.toString(),
      userName: userMap[interaction.userId.toString()]?.name || "Unknown User",
      userAvatar: userMap[interaction.userId.toString()]?.avatar || "",
      placeId: interaction.placeId.toString(),
      createdAt: interaction.date.toISOString(),
      isOwnReview: true,
      userRating: interaction.rating || null,
    };

    return {
      review,
      averageRating: stats.averageRating.toFixed(1),
      ratingCount: stats.ratingCount,
    };
  } catch (error) {
    console.error("Error adding review or rating place:", error);
    throw new GraphQLError("Error adding review or rating place", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
