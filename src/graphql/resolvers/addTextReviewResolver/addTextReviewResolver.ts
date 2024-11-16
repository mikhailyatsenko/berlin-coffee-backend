import Interaction, { IInteraction } from "../../../models/Interaction.js";
import User from "../../../models/User.js";
import Place from "../../../models/Place.js";
import { GraphQLError } from "graphql";
import { IUser } from "src/models/User.js";

interface UserMap {
  [key: string]: {
    name: string;
    avatar: string;
  };
}

export async function addTextReviewResolver(
  _: never,
  { text, placeId }: { placeId: string; text: string },
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

    const interaction = await Interaction.findOne({
      userId: user.id,
      placeId,
    }).lean();

    const updateData: Partial<IInteraction> = {
      date: new Date(),
      review: text,
    };

    if (interaction) {
      await Interaction.findOneAndUpdate(
        { userId: user.id, placeId },
        { $set: updateData },
        { new: true, lean: true },
      );
    } else {
      await Interaction.create({
        userId: user.id,
        placeId,
        ...updateData,
      });
    }

    const updatedInteraction = await Interaction.findOne({
      userId: user.id,
      placeId,
    }).lean();

    if (!updatedInteraction) {
      throw new GraphQLError("Failed to create or update interaction");
    }

    const userDoc = await User.findById(user.id).lean();
    const userMap: UserMap = {
      [user.id]: {
        name: userDoc?.displayName || "Unknown User",
        avatar: userDoc?.avatar || "",
      },
    };

    const review = {
      id: updatedInteraction._id.toString(),
      text: updatedInteraction.review || "",
      userId: updatedInteraction.userId.toString(),
      userName:
        userMap[updatedInteraction.userId.toString()]?.name || "Unknown User",
      userAvatar: userMap[updatedInteraction.userId.toString()]?.avatar || "",
      placeId: updatedInteraction.placeId.toString(),
      createdAt: updatedInteraction.date.toISOString(),
      isOwnReview: true,
    };

    return {
      review,
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
