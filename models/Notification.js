const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  type: {
    type: String,
    enum: ["booking", "system", "payment"],
    default: "system",
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    // Can ref Booking, Hall, etc. optional
  }
});

module.exports = mongoose.model("Notification", NotificationSchema);
