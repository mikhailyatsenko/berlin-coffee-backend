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
    const result = await Interaction.findOneAndDelete({
      _id: reviewId,
      userId: context.user.id,
    });

    if (!result) {
      return {
        success: false,
        message: "Review not found or you don't have permission to delete it",
      };
    }

    return {
      success: true,
      message: "Review and rating deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting review:", error);
    return {
      success: false,
      message: "Error deleting review",
    };
  }
}
