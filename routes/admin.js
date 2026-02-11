const express = require("express");
const User = require("../models/User");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const HallAlloted = require("../models/HallAlloted");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// All routes require admin authentication
router.use(auth);
router.use(authorize("admin"));

// @route GET /api/admin/stats
// @desc  Get admin dashboard statistics
// @access  Private (Admin)
router.get("/stats", async (req, res) => {
  try {
    // ✅ OPTIMIZED: Use aggregation pipelines and run in parallel
    const [userStats, hallStats, bookingStats, revenueStats] = await Promise.all([
      // User statistics with aggregation
      User.aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Hall statistics with aggregation
      Hall.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: {
              $sum: { $cond: [{ $eq: ["$isApproved", "approved"] }, 1, 0] }
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$isApproved", "pending"] }, 1, 0] }
            }
          }
        }
      ]),
      
      // Booking statistics with aggregation
      Booking.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Revenue from HallAlloted with aggregation
      HallAlloted.aggregate([
        {
          $match: {
            status: { $in: ['confirmed', 'completed'] },
            paymentStatus: { $in: ['paid', 'partial'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalPaid: { $sum: '$amountPaid' },
            totalCommission: { $sum: '$platformFee' },
            confirmedCount: {
              $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] }
            },
            completedCount: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    // Format response
    const userCounts = userStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    const bookingCounts = bookingStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      totalPaid: 0,
      totalCommission: 0,
      confirmedCount: 0,
      completedCount: 0
    };

    res.json({
      totalUsers: userCounts.user || 0,
      totalHallOwners: userCounts.hall_owner || 0,
      totalHalls: hallStats[0]?.total || 0,
      pendingHalls: hallStats[0]?.pending || 0,
      totalBookings: Object.values(bookingCounts).reduce((a, b) => a + b, 0),
      pendingBookings: bookingCounts.pending || 0,
      totalAllotments: revenue.confirmedCount + revenue.completedCount,
      confirmedAllotments: revenue.confirmedCount,
      completedAllotments: revenue.completedCount,
      totalRevenue: revenue.totalRevenue,
      totalPaid: revenue.totalPaid,
      totalCommission: revenue.totalCommission,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/admin/users
// @desc  Get all users
// @access Private (Admin)
router.get("/users", async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};

    // ✅ OPTIMIZED: Use lean() for read-only queries
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/admin/users/:id
// @desc Update user (e.g., change role, verify)
// @access Private (Admin)
router.put("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { role, isVerified } = req.body;
    if (role) user.role = role;
    if (isVerified !== undefined) user.isVerified = isVerified;

    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route DELETE /api/admin/users/:id
// @desc Delete a user
// @access Private (Admin)
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.deleteOne();
    res.json({ message: "User deleted successfully" });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/admin/users/:id/block
// @desc Block or unblock a user
// @access Private (Admin)
router.put("/users/:id/block", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { isBlocked } = req.body;
    user.isBlocked = isBlocked;
    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isBlocked: user.isBlocked,
      message: isBlocked ? "User blocked successfully" : "User unblocked successfully"
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/admin/halls
// @desc Get all halls (including pending)
// @access Private (Admin)
router.get("/halls", async (req, res) => {
  try {
    const { isApproved } = req.query;
    let filter = {};
    
    if (isApproved !== undefined) {
      if (isApproved === "true") {
        filter.isApproved = "approved";
      } else if (isApproved === "false") {
        filter.isApproved = "pending";
      }
    }

    // ✅ OPTIMIZED: Use lean() for read-only queries
    const halls = await Hall.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json(halls);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/admin/halls/:id/approve
// @desc Approve or reject a hall
// @access Private (Admin)
router.put("/halls/:id/approve", async (req, res) => {
  try {
    const { isApproved } = req.body;
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    // Convert boolean to string status
    hall.isApproved = isApproved ? 'approved' : 'rejected';
    await hall.save();

    await hall.populate("owner", "name email");

    res.json(hall);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/admin/bookings
// @desc Get all bookings
// @access Private (Admin)
router.get("/bookings", async (req, res) => {
  try {
    // ✅ OPTIMIZED: Use lean() for read-only queries
    const bookings = await Booking.find()
      .populate("user", "name email phone")
      .populate("hall", "name location")
      .sort({ bookingDate: -1, createdAt: -1 })
      .lean();

    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/admin/unblock-requests
// @desc Get all unblock requests
// @access Private (Admin)
router.get("/unblock-requests", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    
    const requests = await Notification.find({ 
      type: "unblock_request",
      "requestData.status": "pending"
    })
      .populate("relatedId", "name email role isBlocked")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/admin/unblock-requests/:id/approve
// @desc Approve unblock request and unblock user
// @access Private (Admin)
router.put("/unblock-requests/:id/approve", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (notification.type !== "unblock_request") {
      return res.status(400).json({ message: "Invalid request type" });
    }

    // Unblock the user
    const user = await User.findById(notification.relatedId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = false;
    await user.save();

    // Update notification status
    notification.requestData.status = "approved";
    notification.isRead = true;
    await notification.save();

    res.json({ 
      message: "User unblocked successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isBlocked: user.isBlocked
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/admin/unblock-requests/:id/deny
// @desc Deny unblock request
// @access Private (Admin)
router.put("/unblock-requests/:id/deny", async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (notification.type !== "unblock_request") {
      return res.status(400).json({ message: "Invalid request type" });
    }

    // Update notification status
    notification.requestData.status = "denied";
    notification.isRead = true;
    await notification.save();

    res.json({ message: "Unblock request denied" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
