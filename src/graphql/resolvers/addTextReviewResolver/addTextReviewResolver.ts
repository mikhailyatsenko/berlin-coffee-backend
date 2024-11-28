import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import { IUser } from "src/models/User.js";

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
    const interaction = await Interaction.findOne({
      userId: user.id,
      placeId,
    }).lean();

    const updateData = { date: new Date(), review: text };

    let reviewId: string | null = null;

    if (interaction) {
      await Interaction.findOneAndUpdate(
        { userId: user.id, placeId },
        { $set: updateData },
        { new: true, lean: true },
      );
      reviewId = interaction._id.toString();
    } else {
      const newInteraction = await Interaction.create({
        userId: user.id,
        placeId,
        ...updateData,
      });

      reviewId = newInteraction._id.toString();
    }

    return {
      reviewId,
      text,
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
