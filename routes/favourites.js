const express = require("express");
const router = express.Router();
const Favourite = require("../models/Favourite");
const { auth } = require("../middleware/auth");

// @route   GET /api/favourites
// @desc    Get user's favorites
// @access  Private (Users only)
router.get("/", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can view favorites.",
        role: req.user.role 
      });
    }

    const { limit = 50, skip = 0, sortBy = "-createdAt" } = req.query;

    const favourites = await Favourite.getUserFavorites(req.user._id, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      sortBy,
    });

    const total = await Favourite.countDocuments({
      user: req.user._id,
      isActive: true,
    });

    res.json({
      favourites,
      total,
      hasMore: total > parseInt(skip) + favourites.length,
    });
  } catch (error) {
    console.error("Error fetching favourites:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   POST /api/favourites/toggle/:hallId
// @desc    Toggle favorite status for a hall
// @access  Private (Users only)
router.post("/toggle/:hallId", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can add favorites. Hall owners and admins cannot like halls.",
        role: req.user.role 
      });
    }

    const { hallId } = req.params;

    const result = await Favourite.toggleFavorite(req.user._id, hallId);

    res.json({
      message: result.favorited ? "Added to favorites" : "Removed from favorites",
      favorited: result.favorited,
      favourite: result.favorite,
    });
  } catch (error) {
    console.error("Error toggling favourite:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   GET /api/favourites/check/:hallId
// @desc    Check if hall is favorited by user
// @access  Private (Users only)
router.get("/check/:hallId", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.json({ isFavorited: false, canFavorite: false });
    }

    const { hallId } = req.params;
    const isFavorited = await Favourite.isFavorited(req.user._id, hallId);

    res.json({ isFavorited, canFavorite: true });
  } catch (error) {
    console.error("Error checking favourite:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   PUT /api/favourites/:id/note
// @desc    Add/update note for a favorite
// @access  Private (Users only)
router.put("/:id/note", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can manage favorites.",
        role: req.user.role 
      });
    }

    const { id } = req.params;
    const { note } = req.body;

    const favourite = await Favourite.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!favourite) {
      return res.status(404).json({ message: "Favourite not found" });
    }

    await favourite.addNote(note);

    res.json({
      message: "Note updated successfully",
      favourite,
    });
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   PUT /api/favourites/:id/tags
// @desc    Add tags to a favorite
// @access  Private (Users only)
router.put("/:id/tags", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can manage favorites.",
        role: req.user.role 
      });
    }

    const { id } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ message: "Tags must be an array" });
    }

    const favourite = await Favourite.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!favourite) {
      return res.status(404).json({ message: "Favourite not found" });
    }

    await favourite.addTags(tags);

    res.json({
      message: "Tags updated successfully",
      favourite,
    });
  } catch (error) {
    console.error("Error updating tags:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   PUT /api/favourites/:id/priority
// @desc    Set priority for a favorite
// @access  Private (Users only)
router.put("/:id/priority", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can manage favorites.",
        role: req.user.role 
      });
    }

    const { id } = req.params;
    const { priority } = req.body;

    if (!["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ message: "Invalid priority value" });
    }

    const favourite = await Favourite.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!favourite) {
      return res.status(404).json({ message: "Favourite not found" });
    }

    await favourite.setPriority(priority);

    res.json({
      message: "Priority updated successfully",
      favourite,
    });
  } catch (error) {
    console.error("Error updating priority:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   DELETE /api/favourites/:id
// @desc    Permanently delete a favorite
// @access  Private (Users only)
router.delete("/:id", auth, async (req, res) => {
  try {
    // Check if user has "user" role
    if (req.user.role !== "user") {
      return res.status(403).json({ 
        message: "Only users can manage favorites.",
        role: req.user.role 
      });
    }

    const { id } = req.params;

    const favourite = await Favourite.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!favourite) {
      return res.status(404).json({ message: "Favourite not found" });
    }

    res.json({ message: "Favourite deleted successfully" });
  } catch (error) {
    console.error("Error deleting favourite:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route   GET /api/favourites/hall/:hallId/count
// @desc    Get favorite count for a hall
// @access  Public
router.get("/hall/:hallId/count", async (req, res) => {
  try {
    const { hallId } = req.params;
    const count = await Favourite.getHallFavoriteCount(hallId);

    res.json({ count });
  } catch (error) {
    console.error("Error getting favourite count:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
