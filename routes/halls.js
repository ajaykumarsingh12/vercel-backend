const express = require("express");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const mongoose = require("mongoose");
const Hall = require("../models/Hall");
const { auth, authorize } = require("../middleware/auth");
const { hallStorage } = require("../config/cloudinary");
const { sendTelegramNotification } = require("../utils/emailService");

const router = express.Router();

// Configure Multer with Cloudinary storage
const upload = multer({ storage: hallStorage });

// Middleware to parse nested FormData fields
const parseFormData = (req, res, next) => {
  if (req.body["location[address]"]) {
    req.body.location = {
      address: req.body["location[address]"],
      city: req.body["location[city]"],
      state: req.body["location[state]"],
      pincode: req.body["location[pincode]"],
    };
  }
  if (req.body.amenities && !Array.isArray(req.body.amenities)) {
    req.body.amenities = [req.body.amenities];
  }
  if (req.body.availability) {
    try {
      req.body.availability = JSON.parse(req.body.availability);
    } catch (error) {
          }
  }
  next();
};

// @route  GET /api/halls
// @desc Get all halls (approved only for public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { city, state, minPrice, maxPrice, capacity, limit } = req.query;

    // DEBUG: Log all halls in database
    const allHalls = await Hall.find();
    // Build filter - ONLY show approved halls on public pages
    const filter = {
      isApproved: "approved"
    };

    if (city) filter["location.city"] = new RegExp(`^${city}$`, "i");
    if (state) filter["location.state"] = new RegExp(`^${state}$`, "i");

    if (capacity) filter.capacity = { $gte: Number(capacity) };

    if (minPrice || maxPrice) {
      filter.pricePerHour = {};
      if (minPrice) filter.pricePerHour.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerHour.$lte = Number(maxPrice);
    }
    let query = Hall.find(filter).sort({ createdAt: -1 });

    // Add limit if specified
    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Number(limit));
    }

    const halls = await query;
    res.json(halls);
  } catch (error) {
    console.error('Error in GET /api/halls:', error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/halls/my-halls
// @desc Get halls owned by current user
// @access Private (Hall Owner)
router.get(
  "/my-halls",
  auth,
  authorize("hall_owner", "admin"),
  async (req, res) => {
    try {
      // Convert to ObjectId for strict comparison
      const ownerId = new mongoose.Types.ObjectId(req.user._id);
      
      //  STRICT FILTER: Only fetch halls where owner exactly matches current user
      const userHalls = await Hall.find({ 
        owner: ownerId 
      })
        .populate("owner", "name email _id")
        .sort({ createdAt: -1 })
        .lean(); // Use lean() for faster read-only queries
      // Double-check: Filter again on backend to ensure no leakage
      const filteredHalls = userHalls.filter(hall => {
        const hallOwnerId = hall.owner?._id?.toString() || hall.owner?.toString();
        const currentUserId = req.user._id.toString();
        return hallOwnerId === currentUserId;
      });

      if (filteredHalls.length !== userHalls.length) {
        console.warn('[MY-HALLS] Security filter removed unauthorized halls:', {
          before: userHalls.length,
          after: filteredHalls.length
        });
      }

      res.json(filteredHalls);
    } catch (error) {
      console.error('[MY-HALLS] Error:', error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route GET /api/halls/debug-user
// @desc Debug endpoint to check user info
// @access Private
router.get("/debug-user", auth, async (req, res) => {
  try {
    const allHalls = await Hall.find().populate("owner", "name email");
    const userHalls = allHalls.filter(hall => {
      if (!hall.owner) return false;
      return hall.owner._id.toString() === req.user._id.toString();
    });

    res.json({
      currentUser: {
        id: req.user._id.toString(),
        role: req.user.role,
        email: req.user.email
      },
      totalHalls: allHalls.length,
      userHalls: userHalls.length,
      hallOwners: allHalls.map(h => ({
        hallName: h.name,
        ownerId: h.owner?._id?.toString(),
        ownerEmail: h.owner?.email
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route GET /api/halls/all-my-halls
// @desc Get ALL halls for hall owner (REMOVED - Security Issue)
// @access Private
router.get("/all-my-halls", auth, async (req, res) => {
  try {
    // SECURITY FIX: This endpoint was returning ALL halls to everyone
    // Now it returns only the current user's halls (same as /my-halls)
    const ownerId = new mongoose.Types.ObjectId(req.user._id);
    const userHalls = await Hall.find({ owner: ownerId })
      .populate("owner", "name email _id")
      .sort({ createdAt: -1 });

    res.json(userHalls);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message, stack: error.stack });
  }
});

// @route GET /api/halls/:id
// @desc Get single hall by ID
// @access Public
router.get("/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate(
      "owner",
      "name email phone"
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json(hall);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/halls
// @desc Create a new hall
// @access Private (Hall Owner)
router.post(
  "/",
  [
    auth,
    authorize("hall_owner", "admin"),
    body("name").trim().notEmpty().withMessage("Hall name is required"),
    body("description").trim().notEmpty().withMessage("Description is required"),
    body("location.address").trim().notEmpty().withMessage("Address is required"),
    body("location.city").trim().notEmpty().withMessage("City is required"),
    body("location.state").trim().notEmpty().withMessage("State is required"),
    body("location.pincode").trim().notEmpty().withMessage("Pincode is required"),
    body("capacity").isInt({ min: 1 }).withMessage("Capacity must be at least 1"),
    body("pricePerHour").isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Accept images as array of URLs (direct Cloudinary upload from frontend)
      const images = Array.isArray(req.body.images) ? req.body.images : [];

      const hallData = {
        ...req.body,
        owner: req.user._id,
        images,
      };

      delete hallData.isApproved;

      const hall = new Hall(hallData);
      await hall.save();

      // Notify admin via Telegram
      const now = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      await sendTelegramNotification(
        `🏛️<b>NEW HALL APPROVAL REQUEST</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎪<b>Hall Information</b>\n` +
        `▸ <b>Name :</b> ${hall.name}\n` +
        `▸ <b>City :</b> ${hall.location?.city}, ${hall.location?.state}\n` +
        `▸ <b>Price :</b> ₹${hall.pricePerHour?.toLocaleString('en-IN')} / hr\n` +
        `▸ <b>Capacity :</b> ${hall.capacity} guests\n\n` +
        `👤 <b>Owner Information</b>\n` +
        `▸ <b>Name :</b> ${req.user.name}\n` +
        `▸ <b>Email :</b> ${req.user.email}\n\n` +
        `🕐 <b>Submitted :</b> ${now}\n\n` +
        `──────────────────────────\n` +
        `⚠️<b>ACTION REQUIRED</b>\n` +
        `This hall is waiting for your approval.\n` +
        `Please <b>Approve ✅</b> or <b>Reject ❌</b> it.\n` +
        `──────────────────────────\n\n` +
        `🔗<a href="${process.env.FRONTEND_URL}/admin/dashboard">👉 Open Admin Dashboard</a>\n\n` +
        `<i>— BookMyHall Notification System</i>`
      );

      res.status(201).json(hall);
    } catch (error) {
            res.status(500).json({ message: "Server error" });
    }
  }
);

// @route PUT /api/halls/:id
// @desc Update a hall
// @route PUT /api/halls/:id
// @desc Update a hall
// @access Private (Hall Owner or Admin)
router.put(
  "/:id",
  [auth],
  async (req, res) => {
    try {
      const hall = await Hall.findById(req.params.id).populate("owner", "_id");

      if (!hall) {
        return res.status(404).json({ message: "Hall not found" });
      }

      // TEMPORARY: Allow hall_owner role to update any hall
      // Check if user is owner, admin, or hall_owner role
      const isOwner = hall.owner?._id
        ? hall.owner._id.toString() === req.user._id.toString()
        : hall.owner?.toString() === req.user._id.toString();
      const isAdmin = req.user.role === "admin";
      const isHallOwner = req.user.role === "hall_owner";

      if (!isOwner && !isAdmin && !isHallOwner) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this hall" });
      }

      // Handle image updates
      let updatedImages = hall.images;

      // Use existingImages as base if provided
      if (req.body.existingImages) {
        updatedImages = Array.isArray(req.body.existingImages)
          ? req.body.existingImages
          : [req.body.existingImages];
      }

      // Append new Cloudinary URLs uploaded directly from frontend
      if (req.body.newImages) {
        const newImgs = Array.isArray(req.body.newImages)
          ? req.body.newImages
          : [req.body.newImages];
        updatedImages = [...updatedImages, ...newImgs];
      }

      // Legacy: also handle multer file uploads if present
      if (req.files && req.files.length > 0) {
        updatedImages = [...updatedImages, ...req.files.map((f) => f.path)];
      }

      // Update hall data
      const updateData = {
        ...req.body,
        images: updatedImages,
      };

      // Remove isApproved from update data - only admin can change approval status
      delete updateData.isApproved;

      // Preserve isAvailable — only update if explicitly sent as a boolean
      if (typeof updateData.isAvailable === 'undefined' || updateData.isAvailable === null) {
        delete updateData.isAvailable;
      } else {
        // Convert string "true"/"false" from form submissions to boolean
        updateData.isAvailable = updateData.isAvailable === true || updateData.isAvailable === 'true';
      }

      // If hall was rejected, reset to pending for admin re-review
      if (hall.isApproved === "rejected" || hall.isApproved === false) {
        hall.isApproved = "pending";
      }

      Object.assign(hall, updateData);
      await hall.save();

      res.json(hall);
    } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route DELETE /api/halls/:id
// @desc Delete a hall
// @access Private (Hall Owner or Admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate("owner", "_id");

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    // TEMPORARY: Allow hall_owner role to delete any hall
    // Check if user is owner, admin, or hall_owner role
    const isOwner = hall.owner?._id
      ? hall.owner._id.toString() === req.user._id.toString()
      : hall.owner?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    const isHallOwner = req.user.role === "hall_owner";

    if (!isOwner && !isAdmin && !isHallOwner) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this hall" });
    }

    await hall.deleteOne();
    res.json({ message: "Hall deleted successfully" });
  } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route POST /api/halls/:id/favorite
// @desc Toggle favorite status for a hall
// @access Private
// @route GET /api/halls/:id/analytics
// @desc Get hall analytics (bookings, revenue trends)
// @access Private (Hall Owner or Admin)
router.get("/:id/analytics", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 6 months if no date range provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 6));
    const end = endDate ? new Date(endDate) : new Date();

    // AGGREGATION PIPELINE for analytics
    const analytics = await Booking.aggregate([
      // Stage 1: Filter by hall and date range
      {
        $match: {
          hall: new mongoose.Types.ObjectId(req.params.id),
          bookingDate: { $gte: start, $lte: end }
        }
      },
      // Stage 2: Group by month
      {
        $group: {
          _id: {
            year: { $year: "$bookingDate" },
            month: { $month: "$bookingDate" }
          },
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          avgBookingValue: { $avg: "$totalAmount" },
          confirmedBookings: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] }
          },
          completedBookings: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          cancelledBookings: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
          }
        }
      },
      // Stage 3: Sort by date
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      },
      // Stage 4: Format output
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          totalBookings: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          avgBookingValue: { $round: ["$avgBookingValue", 2] },
          confirmedBookings: 1,
          completedBookings: 1,
          cancelledBookings: 1
        }
      }
    ]);

    res.json(analytics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
