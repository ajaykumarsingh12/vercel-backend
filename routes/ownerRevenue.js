const express = require("express");
const router = express.Router();
const OwnerRevenue = require("../models/OwnerRevenue");
const Hall = require("../models/Hall");
const { auth } = require("../middleware/auth");

// @route GET /api/owner-revenue
// @desc Get all revenue records for the authenticated hall owner
// @access Private (Hall Owner)
router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const { page = 1, limit = 10, startDate, endDate, hall } = req.query;

    // Build filter
    const filter = {};

    if (req.user.role === "hall_owner") {
      filter.hallOwner = req.user._id;
    }

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (hall) {
      filter.hall = hall;
    }

    const revenues = await OwnerRevenue.find(filter)
      .populate("hall", "name location")
      .populate("customer", "name email")
      .populate("booking", "bookingDate specialRequests")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await OwnerRevenue.countDocuments(filter);

    res.json({
      revenues,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/owner-revenue/debug/:bookingId
// @desc Debug endpoint to check if revenue record exists for a booking
// @access Private (Hall Owner or Admin)
router.get("/debug/:bookingId", auth, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find revenue record for this booking
    const revenueRecord = await OwnerRevenue.findOne({ booking: bookingId })
      .populate("hall", "name")
      .populate("customer", "name phone")
      .populate("booking", "bookingDate startTime endTime totalAmount");

    if (revenueRecord) {
      res.json({
        found: true,
        message: "Revenue record exists",
        record: {
          id: revenueRecord._id,
          hallName: revenueRecord.hallName,
          customerPhone: revenueRecord.customerPhone,
          date: revenueRecord.date,
          time: `${revenueRecord.startTime}-${revenueRecord.endTime}`,
          totalAmount: revenueRecord.totalAmount,
          commission: revenueRecord.hallOwnerCommission,
          platformFee: revenueRecord.platformFee,
          status: revenueRecord.status,
          createdAt: revenueRecord.createdAt
        }
      });
    } else {
      res.json({
        found: false,
        message: "No revenue record found for this booking",
        bookingId
      });
    }
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route GET /api/owner-revenue/latest
// @desc Get latest revenue records for testing
// @access Private (Hall Owner)
router.get("/latest", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const filter = {};
    if (req.user.role === "hall_owner") {
      filter.hallOwner = req.user._id;
    }

    const latestRevenues = await OwnerRevenue.find(filter)
      .populate("hall", "name location")
      .populate("customer", "name email phone")
      .populate("booking", "bookingDate specialRequests")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      message: "Latest revenue records",
      count: latestRevenues.length,
      revenues: latestRevenues
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/owner-revenue/total
// @desc Get total revenue for the authenticated hall owner
// @access Private (Hall Owner)
router.get("/total", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const { startDate, endDate } = req.query;

    const hallOwnerId = req.user.role === "admin" ? req.query.hallOwnerId : req.user._id;

    if (!hallOwnerId) {
      return res.status(400).json({ message: "Hall owner ID is required for admin requests" });
    }

    const stats = await OwnerRevenue.getTotalRevenue(hallOwnerId, startDate, endDate);

    res.json(stats);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/owner-revenue/by-hall
// @desc Get revenue breakdown by hall
// @access Private (Hall Owner)
router.get("/by-hall", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const { startDate, endDate } = req.query;

    const hallOwnerId = req.user.role === "admin" ? req.query.hallOwnerId : req.user._id;

    if (!hallOwnerId) {
      return res.status(400).json({ message: "Hall owner ID is required for admin requests" });
    }

    const revenueByHall = await OwnerRevenue.getRevenueByHall(hallOwnerId, startDate, endDate);

    res.json(revenueByHall);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/owner-revenue/monthly-stats
// @desc Get monthly revenue statistics
// @access Private (Hall Owner)
router.get("/monthly-stats", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const { year } = req.query;

    const hallOwnerId = req.user.role === "admin" ? req.query.hallOwnerId : req.user._id;

    if (!hallOwnerId) {
      return res.status(400).json({ message: "Hall owner ID is required for admin requests" });
    }

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const monthlyStats = await OwnerRevenue.getMonthlyStats(hallOwnerId, currentYear);

    res.json(monthlyStats);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/owner-revenue/complete-booking
// @desc Add booking details to OwnerRevenue collection and update booking status to completed
// @access Private (Hall Owner)
router.post("/complete-booking", auth, async (req, res) => {
  try {
    if (req.user.role !== "hall_owner") {
      return res.status(403).json({ message: "Access denied. Hall owners only." });
    }

    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID is required" });
    }

    // Get the booking with all necessary details
    const Booking = require("../models/Booking");
    const booking = await Booking.findById(bookingId)
      .populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone"
        }
      })
      .populate("user", "name email phone");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if the hall belongs to the authenticated user
    if (booking.hall.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to complete this booking" });
    }

    // Check if revenue record already exists
    const existingRevenue = await OwnerRevenue.findOne({ booking: booking._id });

    if (existingRevenue) {
      return res.status(400).json({
        message: "Revenue record already exists for this booking",
        revenue: existingRevenue
      });
    }

    const revenueData = {
      hallOwner: booking.hall.owner._id,
      hall: booking.hall._id,
      hallName: booking.hall.name,
      customer: booking.user._id,
      customerPhone: booking.user.phone || "N/A",
      customerName: booking.user.name,
      customerEmail: booking.user.email,
      booking: booking._id,
      date: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.totalHours,
      totalAmount: booking.totalAmount,
      hallOwnerCommission: booking.totalAmount, // 100% to hall owner (no platform fee)
      platformFee: 0, // No platform fee
      status: "completed",
      completedAt: new Date(),
      specialRequests: booking.specialRequests,
      hallLocation: {
        city: booking.hall.location?.city,
        state: booking.hall.location?.state,
        address: booking.hall.location?.address
      },
      paymentMethod: "online",
      transactionId: `TXN_${booking._id}_${Date.now()}`,
      notes: `Revenue record created on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}. Customer: ${booking.user.name} (${booking.user.email}). Hall: ${booking.hall.name} at ${booking.hall.location?.city}, ${booking.hall.location?.state}. Duration: ${booking.totalHours} hours. Special requests: ${booking.specialRequests || 'None'}.`
    };

    const ownerRevenue = new OwnerRevenue(revenueData);
    await ownerRevenue.save();

    // Update booking status to completed
    booking.status = "completed";
    await booking.save();

    

    const populatedRevenue = await OwnerRevenue.findById(ownerRevenue._id)
      .populate("hall", "name location")
      .populate("customer", "name email phone")
      .populate("booking", "bookingDate specialRequests totalHours");

    res.status(201).json({
      message: "Revenue record created and booking completed successfully",
      revenue: populatedRevenue,
      booking: {
        id: booking._id,
        status: booking.status
      },
      details: {
        hallName: revenueData.hallName,
        customerName: booking.user.name,
        customerPhone: revenueData.customerPhone,
        date: new Date(revenueData.date).toLocaleDateString('en-IN'),
        time: `${revenueData.startTime} - ${revenueData.endTime}`,
        commission: revenueData.totalAmount, // Use totalAmount instead of hallOwnerCommission
        transactionId: revenueData.transactionId
      }
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const {
      hallOwner,
      hall,
      hallName,
      customer,
      customerPhone,
      booking,
      date,
      startTime,
      endTime,
      totalAmount,
      hallOwnerCommission,
      platformFee,
      notes
    } = req.body;

    // Validate required fields
    if (!hallOwner || !hall || !hallName || !customer || !customerPhone ||
      !booking || !date || !startTime || !endTime || !totalAmount) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Check if revenue record already exists for this booking
    const existingRevenue = await OwnerRevenue.findOne({ booking });
    if (existingRevenue) {
      return res.status(400).json({ message: "Revenue record already exists for this booking" });
    }

    const revenue = new OwnerRevenue({
      hallOwner,
      hall,
      hallName,
      customer,
      customerPhone,
      booking,
      date: new Date(date),
      startTime,
      endTime,
      totalAmount,
      hallOwnerCommission: hallOwnerCommission || totalAmount * 0.9,
      platformFee: platformFee || totalAmount * 0.1,
      notes
    });

    await revenue.save();

    const populatedRevenue = await OwnerRevenue.findById(revenue._id)
      .populate("hall", "name location")
      .populate("customer", "name email")
      .populate("booking", "bookingDate specialRequests");

    res.status(201).json(populatedRevenue);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/owner-revenue/:id
// @desc Update a revenue record (e.g., for refunds)
// @access Private (Hall Owner or Admin)
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const revenue = await OwnerRevenue.findById(id);
    if (!revenue) {
      return res.status(404).json({ message: "Revenue record not found" });
    }

    // Check authorization
    if (req.user.role !== "admin" && revenue.hallOwner.toString() !== req.user._id) {
      return res.status(403).json({ message: "Not authorized to update this revenue record" });
    }

    Object.assign(revenue, updates);
    await revenue.save();

    const updatedRevenue = await OwnerRevenue.findById(id)
      .populate("hall", "name location")
      .populate("customer", "name email")
      .populate("booking", "bookingDate specialRequests");

    res.json(updatedRevenue);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route DELETE /api/owner-revenue/:id
// @desc Delete a revenue record (Admin only)
// @access Private (Admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { id } = req.params;

    const revenue = await OwnerRevenue.findById(id);
    if (!revenue) {
      return res.status(404).json({ message: "Revenue record not found" });
    }

    await OwnerRevenue.findByIdAndDelete(id);

    res.json({ message: "Revenue record deleted successfully" });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;