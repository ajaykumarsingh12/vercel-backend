const mongoose = require("mongoose");

const favouriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
      index: true,
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure a user can't favorite the same hall twice
favouriteSchema.index({ user: 1, hall: 1 }, { unique: true });

// Index for querying user's favorites
favouriteSchema.index({ user: 1, isActive: 1 });

// Index for querying hall's favorite count
favouriteSchema.index({ hall: 1, isActive: 1 });

// Index for sorting by creation date
favouriteSchema.index({ createdAt: -1 });

// Virtual for checking if favorite is recent (added in last 7 days)
favouriteSchema.virtual("isRecent").get(function () {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return this.createdAt > sevenDaysAgo;
});

// Static method to get user's favorite halls
favouriteSchema.statics.getUserFavorites = async function (userId, options = {}) {
  const { limit = 50, skip = 0, sortBy = "-createdAt" } = options;
  
  return this.find({ user: userId, isActive: true })
    .populate("hall")
    .sort(sortBy)
    .limit(limit)
    .skip(skip);
};

// Static method to check if hall is favorited by user
favouriteSchema.statics.isFavorited = async function (userId, hallId) {
  const favorite = await this.findOne({
    user: userId,
    hall: hallId,
    isActive: true,
  });
  return !!favorite;
};

// Static method to get favorite count for a hall
favouriteSchema.statics.getHallFavoriteCount = async function (hallId) {
  return this.countDocuments({ hall: hallId, isActive: true });
};

// Static method to toggle favorite
favouriteSchema.statics.toggleFavorite = async function (userId, hallId) {
  const existing = await this.findOne({ user: userId, hall: hallId });

  if (existing) {
    // Hard delete - completely remove from database
    await this.deleteOne({ _id: existing._id });
    return { favorited: false, favorite: null };
  } else {
    // Create new favorite
    const favorite = await this.create({ user: userId, hall: hallId });
    return { favorited: true, favorite };
  }
};

// Instance method to add note
favouriteSchema.methods.addNote = function (note) {
  this.notes = note;
  return this.save();
};

// Instance method to add tags
favouriteSchema.methods.addTags = function (tags) {
  this.tags = [...new Set([...this.tags, ...tags])]; // Remove duplicates
  return this.save();
};

// Instance method to set priority
favouriteSchema.methods.setPriority = function (priority) {
  this.priority = priority;
  return this.save();
};

module.exports = mongoose.model("Favourite", favouriteSchema);
