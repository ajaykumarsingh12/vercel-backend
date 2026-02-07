const express = require("express");
const router = express.Router();
const HallAlloted = require("../models/HallAlloted");
const Hall = require("../models/Hall");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { auth } = require("../middleware/auth");

// Get all hall allotments (Admin only)
router.get("/admin/all", auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, paymentStatus, startDate, endDate } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (startDate && endDate) {
      filter.allotmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const allotments = await HallAlloted.find(filter)
      .populate("hall", "name location pricePerHour")
      .populate("user", "name email phone")
      .populate("booking", "bookingDate specialRequests")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await HallAlloted.countDocuments(filter);

    res.json({
      allotments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get hall allotments by hall ID
router.get("/hall/:hallId", auth, async (req, res) => {
  try {
    const { hallId } = req.params;
    const { startDate, endDate } = req.query;

    const filter = { hall: hallId };
    if (startDate && endDate) {
      filter.allotmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const allotments = await HallAlloted.find(filter)
      .populate("user", "name email")
      .populate("booking", "bookingDate")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(allotments);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get availability slots for a hall (for slot management)
router.get("/hall/:hallId/slots", auth, async (req, res) => {
  try {
    const { hallId } = req.params;

    // Find all availability slots (where status is 'available' AND isAvailabilitySlot is true)
    const slots = await HallAlloted.find({
      hall: hallId,
      status: "available",
      isAvailabilitySlot: true
    })
      .populate("hall", "name")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(slots);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get all slots for a hall (both available and booked) for hall owner dashboard
router.get("/hall/:hallId/all-slots", auth, async (req, res) => {
  try {
    const { hallId } = req.params;

    // Find all slots for this hall
    const slots = await HallAlloted.find({
      hall: hallId
    })
      .populate("hall", "name")
      .populate("user", "name email")
      .populate("booking", "bookingDate")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(slots);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get all hall allotments for a hall (both availability slots and bookings) - Public endpoint
router.get("/hall/:hallId/all", async (req, res) => {
  try {
    const { hallId } = req.params;

    // Find all hall allotments for this hall
    const allotments = await HallAlloted.find({
      hall: hallId
    })
      .populate("hall", "name")
      .populate("user", "name email")
      .populate("booking", "bookingDate")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(allotments);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get availability slots for a hall (public endpoint for viewing)
router.get("/hall/:hallId/availability", async (req, res) => {
  try {
    const { hallId } = req.params;

    // Find all availability slots (where status is 'available' AND isAvailabilitySlot is true)
    const slots = await HallAlloted.find({
      hall: hallId,
      status: "available",
      isAvailabilitySlot: true
    })
      .populate("hall", "name")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(slots);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get booked slots for a hall (actual bookings)
router.get("/hall/:hallId/bookings", auth, async (req, res) => {
  try {
    const { hallId } = req.params;

    // Find all actual bookings (where status is not 'available' and isAvailabilitySlot is not true)
    const bookings = await HallAlloted.find({
      hall: hallId,
      status: { $in: ['confirmed', 'completed', 'cancelled'] },
      $and: [
        { status: { $ne: "available" } },
        { $or: [{ isAvailabilitySlot: { $exists: false } }, { isAvailabilitySlot: false }] }
      ]
    })
      .populate("user", "name email")
      .populate("booking", "bookingDate")
      .sort({ allotmentDate: 1, startTime: 1 });

    res.json(bookings);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get user's hall allotments
router.get("/user/my-allotments", auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const filter = { user: req.user.id };
    if (status) filter.status = status;

    const allotments = await HallAlloted.find(filter)
      .populate("hall", "name location images amenities")
      .populate("booking", "bookingDate specialRequests")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await HallAlloted.countDocuments(filter);

    res.json({
      allotments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Create new hall allotment
router.post("/", auth, async (req, res) => {
  try {
    const {
      hall,
      booking,
      allotmentDate,
      startTime,
      endTime,
      duration,
      totalAmount,
      specialRequirements,
      additionalServices,
      notes,
      isAvailabilitySlot,
      isRecurring,
      recurringPattern,
      recurringDays
    } = req.body;

    // Check if hall exists and is available
    const hallDoc = await Hall.findById(hall);
    if (!hallDoc) {
      return res.status(404).json({ message: "Hall not found" });
    }

    // For availability slots, we don't need to check conflicts or create bookings
    if (isAvailabilitySlot) {
      const slots = [];

      if (isRecurring && recurringDays && recurringDays.length > 0) {
        // Create recurring slots
        const startDate = new Date(allotmentDate);
        const endDate = new Date(recurringPattern.endDate);

        const dayMap = {
          'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
          'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

          if (recurringDays.includes(dayName)) {
            const slot = new HallAlloted({
              hall,
              user: null,
              booking: null,
              allotmentDate: new Date(currentDate),
              startTime,
              endTime,
              duration: duration || calculateDuration(startTime, endTime),
              totalAmount: 0,
              platformFee: 0,
              hallOwnerCommission: 0,
              specialRequirements,
              additionalServices: additionalServices || [],
              notes: notes || "Availability slot created by hall owner",
              status: 'available',
              paymentStatus: 'not_applicable',
              isAvailabilitySlot: true,
              isRecurring: true,
              recurringPattern
            });

            await slot.save();
            slots.push(slot);
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        // Create single slot
        const slot = new HallAlloted({
          hall,
          user: null,
          booking: null,
          allotmentDate: new Date(allotmentDate),
          startTime,
          endTime,
          duration: duration || calculateDuration(startTime, endTime),
          totalAmount: 0,
          platformFee: 0,
          hallOwnerCommission: 0,
          specialRequirements,
          additionalServices: additionalServices || [],
          notes: notes || "Availability slot created by hall owner",
          status: 'available',
          paymentStatus: 'not_applicable',
          isAvailabilitySlot: true,
          isRecurring: false
        });

        await slot.save();
        slots.push(slot);
      }

      const populatedSlots = await HallAlloted.find({
        _id: { $in: slots.map(s => s._id) }
      }).populate("hall", "name location");

      return res.status(201).json(slots.length === 1 ? populatedSlots[0] : populatedSlots);
    }

    // Original booking logic for actual bookings
    // Check for time conflicts
    const existingAllotment = await HallAlloted.findOne({
      hall,
      allotmentDate: new Date(allotmentDate),
      status: { $in: ['confirmed', 'completed'] },
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    });

    if (existingAllotment) {
      return res.status(400).json({ message: "Hall is already booked for this time slot" });
    }

    // Calculate platform fee (5% of total amount)
    const platformFee = totalAmount * 0.05;
    const hallOwnerCommission = totalAmount * 0.9; // 90% to hall owner

    // Create a dummy booking if not provided (for hall owner created slots)
    let bookingId = booking;
    if (!booking) {
      const User = require("../models/User");
      const dummyUser = await User.findOne({ role: "admin" }); // or create a system user

      const Booking = require("../models/Booking");
      const dummyBooking = new Booking({
        user: dummyUser?._id,
        hall,
        bookingDate: new Date(allotmentDate),
        startTime,
        endTime,
        totalHours: duration,
        totalAmount,
        status: 'confirmed',
        paymentStatus: 'pending',
        specialRequests: specialRequirements
      });

      await dummyBooking.save();
      bookingId = dummyBooking._id;
    }

    const allotment = new HallAlloted({
      hall,
      user: req.user.id,
      booking: bookingId,
      allotmentDate: new Date(allotmentDate),
      startTime,
      endTime,
      duration,
      totalAmount,
      platformFee,
      hallOwnerCommission,
      specialRequirements,
      additionalServices,
      notes,
      status: 'confirmed',
      paymentStatus: 'pending'
    });

    await allotment.save();

    // Update booking status if we created one
    if (!booking) {
      await Booking.findByIdAndUpdate(bookingId, {
        status: 'confirmed',
        paymentStatus: 'pending'
      });
    }

    const populatedAllotment = await HallAlloted.findById(allotment._id)
      .populate("hall", "name location")
      .populate("user", "name email")
      .populate("booking", "bookingDate");

    res.status(201).json(populatedAllotment);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Helper function to calculate duration
function calculateDuration(startTime, endTime) {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  const diffMs = end - start;
  return diffMs / (1000 * 60 * 60); // Convert to hours
}

// Update hall allotment
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allotment = await HallAlloted.findById(id).populate('hall', 'owner');
    if (!allotment) {
      return res.status(404).json({ message: "Allotment not found" });
    }

    // Check authorization - for availability slots, check hall ownership; for bookings, check user ownership
    let isAuthorized = false;

    if (req.user.role === 'admin') {
      isAuthorized = true;
    } else if (allotment.isAvailabilitySlot) {
      // For availability slots, check if user owns the hall
      isAuthorized = allotment.hall.owner.toString() === req.user.id;
    } else if (allotment.user) {
      // For regular bookings, check if user owns the booking
      isAuthorized = allotment.user.toString() === req.user.id;
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: "Not authorized to update this slot" });
    }

    // For availability slots, ensure certain fields remain consistent
    if (allotment.isAvailabilitySlot) {
      updates.user = null;
      updates.booking = null;
      updates.status = 'available';
      updates.paymentStatus = 'not_applicable';
      updates.totalAmount = 0;
      updates.platformFee = 0;
      updates.hallOwnerCommission = 0;
    }

    Object.assign(allotment, updates);

    // Validate the updated document before saving
    try {
      await allotment.validate();
    } catch (validationError) {
      console.error(validationError);
            return res.status(400).json({
        message: "Validation error",
        details: validationError.message,
        errors: validationError.errors
      });
    }

    await allotment.save();

    const updatedAllotment = await HallAlloted.findById(id)
      .populate("hall", "name location")
      .populate("user", "name email")
      .populate("booking", "bookingDate");

    res.json(updatedAllotment);
  } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
  }
});

// Cancel hall allotment
router.post("/:id/cancel", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const allotment = await HallAlloted.findById(id);
    if (!allotment) {
      return res.status(404).json({ message: "Allotment not found" });
    }

    // Check if user owns this allotment or is admin
    if (allotment.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Check if cancellation is allowed (e.g., not within 24 hours)
    const now = new Date();
    const allotmentDateTime = new Date(`${allotment.allotmentDate.toISOString().split('T')[0]}T${allotment.startTime}`);
    const hoursDiff = (allotmentDateTime - now) / (1000 * 60 * 60);

    if (hoursDiff < 24 && req.user.role !== 'admin') {
      return res.status(400).json({
        message: "Cancellation not allowed within 24 hours of booking time"
      });
    }

    // Calculate refund amount (80% if cancelled more than 48 hours, 50% if 24-48 hours)
    let refundPercentage = 0;
    if (hoursDiff > 48) {
      refundPercentage = 0.8;
    } else if (hoursDiff >= 24) {
      refundPercentage = 0.5;
    }

    const refundAmount = allotment.totalAmount * refundPercentage;

    allotment.status = 'cancelled';
    allotment.cancellationReason = cancellationReason;
    allotment.cancellationDate = new Date();
    allotment.refundAmount = refundAmount;

    await allotment.save();

    // Update booking status
    await Booking.findByIdAndUpdate(allotment.booking, {
      status: 'cancelled'
    });

    res.json({
      message: "Allotment cancelled successfully",
      refundAmount,
      refundPercentage: refundPercentage * 100
    });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Check-in hall allotment
router.post("/:id/checkin", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const allotment = await HallAlloted.findById(id);
    if (!allotment) {
      return res.status(404).json({ message: "Allotment not found" });
    }

    if (allotment.status !== 'confirmed') {
      return res.status(400).json({ message: "Only confirmed allotments can be checked in" });
    }

    allotment.actualCheckIn = new Date();
    allotment.status = 'completed';
    await allotment.save();

    res.json({ message: "Check-in successful" });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Add feedback to completed allotment
router.post("/:id/feedback", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    const allotment = await HallAlloted.findById(id);
    if (!allotment) {
      return res.status(404).json({ message: "Allotment not found" });
    }

    // Check if user owns this allotment
    if (allotment.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (allotment.status !== 'completed') {
      return res.status(400).json({ message: "Feedback can only be added to completed allotments" });
    }

    allotment.feedback = { rating, comment };
    await allotment.save();

    res.json({ message: "Feedback added successfully" });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get revenue statistics (Admin only)
router.get("/admin/revenue-stats", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await HallAlloted.getRevenueStats(start, end);

    // Get monthly breakdown
    const monthlyStats = await HallAlloted.aggregate([
      {
        $match: {
          allotmentDate: { $gte: start, $lte: end },
          status: { $in: ['confirmed', 'completed'] },
          paymentStatus: { $in: ['paid', 'partial'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$allotmentDate' },
            month: { $month: '$allotmentDate' }
          },
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      summary: stats[0] || {
        totalRevenue: 0,
        totalPaid: 0,
        totalCommission: 0,
        totalAllotments: 0,
        averageAmount: 0
      },
      monthly: monthlyStats
    });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Get hall owner's allotments and earnings
router.get("/owner/my-allotments", auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    // Find all halls owned by this user
    const userHalls = await Hall.find({ owner: req.user.id }).select('_id');
    const hallIds = userHalls.map(hall => hall._id);

    const filter = { hall: { $in: hallIds } };
    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.allotmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const allotments = await HallAlloted.find(filter)
      .populate("hall", "name location")
      .populate("user", "name email")
      .populate("booking", "bookingDate")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await HallAlloted.countDocuments(filter);

    // Calculate earnings
    const totalEarnings = allotments.reduce((sum, allotment) => {
      return sum + (allotment.paymentStatus === 'paid' ? allotment.hallOwnerCommission : 0);
    }, 0);

    res.json({
      allotments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      totalEarnings
    });
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// Delete hall allotment (availability slot or booking)
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    
    const allotment = await HallAlloted.findById(id).populate('hall', 'owner name');
    if (!allotment) {
            return res.status(404).json({ message: "Allotment not found" });
    }

    
    // Check if user owns the hall this allotment belongs to or is admin
    if (allotment.hall.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: "Not authorized to delete this slot" });
    }

    // Allow deletion of:
    // 1. Availability slots (isAvailabilitySlot: true)
    // 2. Cancelled bookings
    // 3. Any booking if user is hall owner (they should be able to cancel/delete bookings)
    if (allotment.isAvailabilitySlot) {
          } else if (allotment.status === 'cancelled') {
          } else if (allotment.hall.owner.toString() === req.user.id) {
            
      // If there's an associated booking, cancel it first
      if (allotment.booking) {
        try {
          await Booking.findByIdAndUpdate(allotment.booking, {
            status: 'cancelled',
            cancellationReason: 'Cancelled by hall owner'
          });
                  } catch (bookingError) {
      console.error(bookingError);
                    // Continue with slot deletion even if booking update fails
        }
      }
    } else {
            return res.status(400).json({
        message: "Cannot delete active bookings that don't belong to you."
      });
    }

    await HallAlloted.findByIdAndDelete(id);
    
    res.json({ 
      message: "Slot deleted successfully",
      deletedId: id,
      type: allotment.isAvailabilitySlot ? 'availability_slot' : 'booking'
    });
  } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
