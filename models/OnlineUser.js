const mongoose = require("mongoose");

const onlineUserSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    selectedRole: {
      type: String,
      enum: ["user", "hall_owner"],
      required: true,
    },
    email: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // Auto-delete after 10 minutes
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("OnlineUser", onlineUserSchema);
