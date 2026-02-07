const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    isVerified: {
      type: Boolean,
      default: false, // True if user actually booked and used the hall
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one review per user per hall per booking
reviewSchema.index({ user: 1, hall: 1, booking: 1 }, { unique: true });

// Index for efficient queries
reviewSchema.index({ hall: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
