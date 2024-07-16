import Interaction from "../../../models/Interaction.js";

export async function deleteReviewResolver(
  _: never,
  { reviewId }: { reviewId: string },
  context: { user: { id: string } },
) {
  if (!context.user) {
    return {
      success: false,
      message: "You must be logged in to delete a review",
    };
  }

  try {
    const review = await Interaction.findOne({
      _id: reviewId,
      userId: context.user.id,
    });

    if (!review) {
      return {
        success: false,
        message: "Review not found or you don't have permission to delete it",
      };
    }

    await Interaction.findByIdAndUpdate(reviewId, { $unset: { review: 1 } });

    return {
      success: true,
      message: "Review deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting review:", error);
    return {
      success: false,
      message: "Error deleting review",
    };
  }
}
