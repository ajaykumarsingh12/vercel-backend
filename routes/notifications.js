const express = require("express");
const { auth } = require("../middleware/auth");
const Notification = require("../models/Notification");

const router = express.Router();

// @route GET /api/notifications
// @desc Get current user's notifications
// @access Private
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20); // Limit to last 20 notifications
    res.json(notifications);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/notifications/mark-read/:id
// @desc Mark a notification as read
// @access Private
router.put("/mark-read/:id", auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/notifications/mark-all-read
// @desc Mark all notifications as read
// @access Private
router.put("/mark-all-read", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
