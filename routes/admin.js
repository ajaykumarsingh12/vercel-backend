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
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalHallOwners = await User.countDocuments({ role: "hall_owner" });
    const totalHalls = await Hall.countDocuments();
    const pendingHalls = await Hall.countDocuments({ isApproved: false });
    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: "pending" });
    const totalAllotments = await HallAlloted.countDocuments();
    const confirmedAllotments = await HallAlloted.countDocuments({ status: "confirmed" });
    const completedAllotments = await HallAlloted.countDocuments({ status: "completed" });

    // Calculate total revenue from completed allotments
    const revenueStats = await HallAlloted.aggregate([
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
          totalCommission: { $sum: '$platformFee' }
        }
      }
    ]);

    const { totalRevenue = 0, totalPaid = 0, totalCommission = 0 } = revenueStats[0] || {};

    res.json({
      totalUsers,
      totalHallOwners,
      totalHalls,
      pendingHalls,
      totalBookings,
      pendingBookings,
      totalAllotments,
      confirmedAllotments,
      completedAllotments,
      totalRevenue,
      totalPaid,
      totalCommission,
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

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

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

// @route GET /api/admin/halls
// @desc Get all halls (including pending)
// @access Private (Admin)
router.get("/halls", async (req, res) => {
  try {
    const { isApproved } = req.query;
    const filter =
      isApproved !== undefined ? { isApproved: isApproved === "true" } : {};

    const halls = await Hall.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

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

    hall.isApproved = isApproved;
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
    const bookings = await Booking.find()
      .populate("user", "name email phone")
      .populate("hall", "name location")
      .sort({ bookingDate: -1, createdAt: -1 });

    res.json(bookings);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
