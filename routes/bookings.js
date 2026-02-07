const express = require("express");
const { body, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");
const { auth } = require("../middleware/auth");

const router = express.Router();

// @route GET /api/bookings
// @desc Get bookings (filtered by user role)
// @access Private
router.get("/", auth, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "user") {
      filter.user = req.user._id;
    } else if (req.user.role === "hall_owner") {
      // Get bookings for halls owned by this user
      const ownedHalls = await Hall.find({ owner: req.user._id }).select("_id");
      const hallIds = ownedHalls.map((hall) => hall._id);
      filter.hall = { $in: hallIds };
    }
    // Admin can see all bookings

    const bookings = await Booking.find(filter)
      .populate("user", "name email phone")
      .populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone",
        },
      })
      .sort({ bookingDate: -1, createdAt: -1 });

    res.json(bookings);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});



// @route GET /api/bookings/availability/:hallId
// @desc Get booked time slots for a specific hall and date
// @access Public
router.get("/availability/:hallId", async (req, res) => {
  try {
    const { date } = req.query;
    let filter = {
      hall: req.params.hallId,
      status: { $in: ["pending", "confirmed", "completed"] },
    };

    if (date) {
      filter.bookingDate = new Date(date);
    } else {
      // Fetch all upcoming bookings from today onwards
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filter.bookingDate = { $gte: today };
    }

    const bookings = await Booking.find(filter).select("bookingDate startTime endTime status");

    res.json(bookings);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route GET /api/bookings/:id
// @desc Get single booking by ID
// @access Private
router.get("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user", "name email phone")
      .populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone",
        },
      });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check authorization
    const isOwner = booking.user._id.toString() === req.user._id.toString();
    const isHallOwner =
      booking.hall && booking.hall.owner && booking.hall.owner._id
        ? booking.hall.owner._id.toString() === req.user._id.toString()
        : false;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isHallOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this booking" });
    }

    res.json(booking);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route POST /api/bookings
// @desc Create a new booking
// @access Private (User)
router.post(
  "/",
  [
    auth,
    body("hall").notEmpty().withMessage("Hall ID is required"),
    body("bookingDate").notEmpty().withMessage("Booking date is required"),
    body("startTime").notEmpty().withMessage("Start time is required"),
    body("endTime").notEmpty().withMessage("End time is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Prevent Hall Owners and Admins from booking
      if (req.user.role !== "user") {
        return res
          .status(403)
          .json({ message: "Admins and Hall owners cannot book halls" });
      }

      const { hall, bookingDate, startTime, endTime, specialRequests } =
        req.body;

      // Check if hall exists and is available
      const hallData = await Hall.findById(hall);
      if (!hallData) {
        return res.status(404).json({ message: "Hall not found" });
      }

      if (!hallData.isAvailable || !hallData.isApproved) {
        return res
          .status(400)
          .json({ message: "Hall is not available for booking" });
      }

      // Check for conflicting bookings
      const conflictingBooking = await Booking.findOne({
        hall,
        bookingDate: new Date(bookingDate),
        status: { $in: ["pending", "confirmed"] },
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
          },
        ],
      });

      if (conflictingBooking) {
        return res.status(400).json({ message: "Time slot is already booked" });
      }

      // Calculate total hours and amount
      // Parse time strings
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      // Convert to minutes from midnight
      const startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;

      // Handle overnight bookings (end time is next day)
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours
      }

      const diffMinutes = endMinutes - startMinutes;
      const totalHours = Math.max(0, diffMinutes / 60);
      const totalAmount = Math.max(0, Math.round(totalHours * hallData.pricePerHour));

      const booking = new Booking({
        user: req.user._id,
        hall,
        bookingDate: new Date(bookingDate),
        startTime,
        endTime,
        totalHours,
        totalAmount,
        specialRequests,
      });

      await booking.save();

      // Update corresponding availability slot in HallAlloted collection
      const HallAlloted = require("../models/HallAlloted");

      // Find the matching availability slot
      const matchingSlot = await HallAlloted.findOne({
        hall: hall,
        allotmentDate: new Date(bookingDate),
        startTime: startTime,
        endTime: endTime,
        isAvailabilitySlot: true,
        status: "available"
      });

      if (matchingSlot) {
        // Update the slot to mark it as booked
        matchingSlot.status = "confirmed";
        matchingSlot.user = req.user._id;
        matchingSlot.booking = booking._id;
        matchingSlot.totalAmount = totalAmount;
        matchingSlot.platformFee = totalAmount * 0.05;
        matchingSlot.hallOwnerCommission = totalAmount * 0.9;
        matchingSlot.paymentStatus = "pending";
        matchingSlot.isAvailabilitySlot = false; // No longer an availability slot
        await matchingSlot.save();
      }

      await booking.populate("user", "name email phone");
      await booking.populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone",
        },
      });

      res.status(201).json(booking);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route PUT /api/bookings/:id/status
// @desc Update booking status
// @access Private (Hall Owner or Admin)
router.put(
  "/:id/status",
  [
    auth,
    body("status")
      .isIn(["pending", "confirmed", "cancelled", "completed"])
      .withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const booking = await Booking.findById(req.params.id).populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone"
        }
      }).populate("user", "name email phone");

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check authorization
      const isHallOwner =
        booking.hall && booking.hall.owner
          ? booking.hall.owner.toString() === req.user._id.toString()
          : false;
      const isAdmin = req.user.role === "admin";

      if (!isHallOwner && !isAdmin) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this booking" });
      }

      booking.status = req.body.status;
      await booking.save();

      // If booking is completed, create OwnerRevenue record
      if (req.body.status === "completed") {
        const OwnerRevenue = require("../models/OwnerRevenue");

        try {
          // Check if revenue record already exists
          const existingRevenue = await OwnerRevenue.findOne({ booking: booking._id });

          if (!existingRevenue) {
            
            
            
            
            
            
            
            

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
              hallOwnerCommission: Math.round(booking.totalAmount * 0.9), // 90% to hall owner
              platformFee: Math.round(booking.totalAmount * 0.1), // 10% platform fee
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
              notes: `Booking completed on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}. Customer: ${booking.user.name} (${booking.user.email}). Hall: ${booking.hall.name} at ${booking.hall.location?.city}, ${booking.hall.location?.state}. Duration: ${booking.totalHours} hours. Special requests: ${booking.specialRequests || 'None'}.`
            };

            const ownerRevenue = new OwnerRevenue(revenueData);
            await ownerRevenue.save();

            
          } else {
            
          }
        } catch (revenueError) {
      console.error(revenueError);
          // Don't fail the booking completion if revenue record creation fails
          // The booking status update should still succeed
        }
      }

      await booking.populate("user", "name email phone");
      await booking.populate({
        path: "hall",
        populate: {
          path: "owner",
          select: "name email phone",
        },
      });

      res.json(booking);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route DELETE /api/bookings/:id
// @desc Cancel a booking
// @access Private (User who made booking or Admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check authorization
    const isOwner = booking.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this booking" });
    }

    // If booking is already cancelled, permanently delete it
    if (booking.status === "cancelled") {
      // Also remove the corresponding HallAlloted record if it exists
      const HallAlloted = require("../models/HallAlloted");
      await HallAlloted.findOneAndDelete({
        booking: booking._id
      });

      await booking.deleteOne();
      return res.json({ message: "Booking deleted successfully" });
    }

    // Otherwise, just mark as cancelled and restore availability slot
    booking.status = "cancelled";
    await booking.save();

    // Restore the availability slot in HallAlloted collection
    const HallAlloted = require("../models/HallAlloted");
    const hallAllotedRecord = await HallAlloted.findOne({
      booking: booking._id
    });

    if (hallAllotedRecord) {
      // Restore it as an availability slot
      hallAllotedRecord.status = "available";
      hallAllotedRecord.user = null;
      hallAllotedRecord.booking = null;
      hallAllotedRecord.totalAmount = 0;
      hallAllotedRecord.platformFee = 0;
      hallAllotedRecord.hallOwnerCommission = 0;
      hallAllotedRecord.paymentStatus = "not_applicable";
      hallAllotedRecord.isAvailabilitySlot = true;
      await hallAllotedRecord.save();
    }

    res.json({ message: "Booking cancelled successfully" });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
