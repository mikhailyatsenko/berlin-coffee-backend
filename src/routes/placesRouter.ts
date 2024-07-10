import { Router } from "express";
import Place from "../models/Place.js";
import User from "../models/User.js";
import { authMiddleware } from "src/middleware/authMiddleware.js";

import { RequestWithUser } from "../../types/express.js";

const router = Router();

router.post(
  "/:placeId/reviews",
  authMiddleware,
  async (req: RequestWithUser, res) => {
    try {
      const { placeId } = req.params;
      const { rating, comment } = req.body;
      const userId = req.user!._id;

      const place = await Place.findById(placeId);
      if (!place) {
        return res.status(404).json({ message: "Place not found" });
      }

      let userReview = place.properties.reviews.find(
        (review) => review.user.toString() === userId.toString(),
      );

      if (userReview) {
        // Update rewiew
        if (rating !== undefined) userReview.rating = rating;
        if (comment !== undefined) userReview.comment = comment;
      } else {
        // Create new rewiew
        userReview = {
          user: userId,
          rating,
          comment,
          createdAt: new Date(),
        };
        place.properties.reviews.push(userReview);
      }

      // Update User
      await User.findByIdAndUpdate(
        userId,
        {
          $set: { "reviews.$[elem]": { place: placeId, rating, comment } },
        },
        {
          arrayFilters: [{ "elem.place": placeId }],
          upsert: true,
        },
      );

      // Count rating
      const totalRating = place.properties.reviews.reduce(
        (sum, review) => sum + (review.rating || 0),
        0,
      );
      const reviewsWithRating = place.properties.reviews.filter(
        (review) => review.rating !== undefined,
      );
      place.properties.averageRating =
        reviewsWithRating.length > 0
          ? totalRating / reviewsWithRating.length
          : 0;

      await place.save();

      res.status(201).json(place);
    } catch (error) {
      res.status(400).json({ message: "Error adding/updating review", error });
    }
  },
);

// Delete review
router.delete(
  "/:placeId/reviews",
  authMiddleware,
  async (req: RequestWithUser, res) => {
    try {
      const { placeId } = req.params;
      const userId = req.user!._id;

      const place = await Place.findById(placeId);
      if (!place) {
        return res.status(404).json({ message: "Place not found" });
      }

      place.properties.reviews = place.properties.reviews.filter(
        (review) => review.user.toString() !== userId.toString(),
      );

      // ReCount average rating
      const totalRating = place.properties.reviews.reduce(
        (sum, review) => sum + (review.rating || 0),
        0,
      );
      const reviewsWithRating = place.properties.reviews.filter(
        (review) => review.rating !== undefined,
      );
      place.properties.averageRating =
        reviewsWithRating.length > 0
          ? totalRating / reviewsWithRating.length
          : 0;

      await place.save();

      // Delete review
      await User.findByIdAndUpdate(userId, {
        $pull: { reviews: { place: placeId } },
      });

      res.json({ message: "Review deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Error deleting review", error });
    }
  },
);

// Get place reviews
router.get("/:placeId/reviews", async (req, res) => {
  try {
    const { placeId } = req.params;
    const place = await Place.findById(placeId).populate(
      "properties.reviews.user",
      "displayName avatar",
    );
    if (!place) {
      return res.status(404).json({ message: "Place not found" });
    }
    res.json(place.properties.reviews);
  } catch (error) {
    res.status(400).json({ message: "Error fetching reviews", error });
  }
});

export default router;
