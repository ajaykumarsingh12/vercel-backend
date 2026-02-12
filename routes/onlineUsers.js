const express = require("express");
const router = express.Router();
const OnlineUser = require("../models/OnlineUser");
const crypto = require("crypto");

// @route POST /api/online-users/set-role
// @desc Store selected role before Google login
// @access Public
router.post("/set-role", async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !["user", "hall_owner"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Valid role is required (user or hall_owner)",
      });
    }

    // Generate unique session ID using crypto
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Create or update online user record
    const onlineUser = new OnlineUser({
      sessionId,
      selectedRole: role,
    });

    await onlineUser.save();

    res.json({
      success: true,
      sessionId,
      message: "Role stored successfully",
    });
  } catch (error) {
    console.error("Set role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to store role",
    });
  }
});

// @route GET /api/online-users/get-role/:sessionId
// @desc Retrieve stored role by session ID
// @access Public
router.get("/get-role/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const onlineUser = await OnlineUser.findOne({ sessionId });

    if (!onlineUser) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.json({
      success: true,
      role: onlineUser.selectedRole,
    });
  } catch (error) {
    console.error("Get role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve role",
    });
  }
});

// @route DELETE /api/online-users/clear/:sessionId
// @desc Clear session after successful login
// @access Public
router.delete("/clear/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    await OnlineUser.findOneAndDelete({ sessionId });

    res.json({
      success: true,
      message: "Session cleared",
    });
  } catch (error) {
    console.error("Clear session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear session",
    });
  }
});

module.exports = router;
