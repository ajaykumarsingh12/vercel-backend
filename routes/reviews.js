const express = require("express");
const { body, validationResult } = require("express-validator");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const { auth } = require("../middleware/auth");

const router = express.Router();

// @route GET /api/reviews/:hallId
// @desc Get reviews for a specific hall
// @access Public
router.get("/:hallId", async (req, res) => {
  try {
    const reviews = await Review.find({ hall: req.params.hallId })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    // Calculate average rating
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
        : 0;

    res.json({
      reviews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/reviews
// @desc Create a new review
// @access Private (User who completed booking)
router.post(
  "/",
  [
    auth,
    body("hall").notEmpty().withMessage("Hall ID is required"),
    body("booking").notEmpty().withMessage("Booking ID is required"),
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment")
      .trim()
      .notEmpty()
      .withMessage("Comment is required")
      .isLength({ max: 500 })
      .withMessage("Comment must be less than 500 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { hall, booking, rating, comment } = req.body;

      // Check if booking exists and belongs to user
      const bookingData = await Booking.findById(booking);
      if (!bookingData) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (bookingData.user.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized to review this booking" });
      }

      // Check if booking is completed
      if (bookingData.status !== "completed") {
        return res
          .status(400)
          .json({ message: "Can only review completed bookings" });
      }

      // Check if review already exists for this booking
      const existingReview = await Review.findOne({ booking });
      if (existingReview) {
        return res
          .status(400)
          .json({ message: "Review already exists for this booking" });
      }

      // Create review
      const review = new Review({
        user: req.user._id,
        hall,
        booking,
        rating,
        comment,
        isVerified: true, // Since user completed the booking
      });

      await review.save();
      await review.populate("user", "name");

      res.status(201).json(review);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route GET /api/reviews/user/my-reviews
// @desc Get reviews by current user
// @access Private
router.get("/user/my-reviews", auth, async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate("hall", "name location")
      .populate("booking", "bookingDate status")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/reviews/:id
// @desc Update a review
// @access Private (Review owner)
router.put(
  "/:id",
  [
    auth,
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment")
      .trim()
      .notEmpty()
      .withMessage("Comment is required")
      .isLength({ max: 500 })
      .withMessage("Comment must be less than 500 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const review = await Review.findById(req.params.id);

      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      if (review.user.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this review" });
      }

      review.rating = req.body.rating;
      review.comment = req.body.comment;

      await review.save();
      await review.populate("user", "name");

      res.json(review);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route DELETE /api/reviews/:id
// @desc Delete a review
// @access Private (Review owner or Admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const isOwner = review.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this review" });
    }

    await review.deleteOne();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
