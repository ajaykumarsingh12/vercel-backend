const express = require("express");
const { body, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const router = express.Router();

// Initialize Razorpay instance
// Set PAYMENT_MODE=simulated in .env to use simulated payments (for testing)
// Set PAYMENT_MODE=razorpay in .env to use real Razorpay payments (for production)
const PAYMENT_MODE = process.env.PAYMENT_MODE || "simulated";

let razorpayInstance = null;
if (PAYMENT_MODE === "razorpay" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

} else { }

// @route POST /api/payments/initiate
// @desc Initiate payment for a booking
// @access Private (User)
router.post(
  "/initiate",
  [
    auth,
    body("bookingId").notEmpty().withMessage("Booking ID is required"),
    body("paymentMethod")
      .isIn(["card", "upi", "netbanking", "wallet"])
      .withMessage("Invalid payment method"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bookingId, paymentMethod } = req.body;

      // Find booking
      const booking = await Booking.findById(bookingId).populate(
        "hall",
        "name",
      );
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check if booking belongs to user
      if (booking.user.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized for this booking" });
      }

      // Check if payment already completed
      if (booking.paymentStatus === "paid") {
        return res.status(400).json({ message: "Payment already completed" });
      }

      let paymentOrder;

      if (PAYMENT_MODE === "razorpay" && razorpayInstance) {
        // REAL RAZORPAY PAYMENT
        try {
          const razorpayOrder = await razorpayInstance.orders.create({
            amount: Math.round(booking.totalAmount * 100), // Amount in paisa
            currency: "INR",
            receipt: `booking_${booking._id}`,
            notes: {
              bookingId: booking._id.toString(),
              hallName: booking.hall.name,
              userId: req.user._id.toString(),
              userName: req.user.name,
            },
          });

          paymentOrder = {
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            booking: bookingId,
            user: req.user._id,
            paymentMethod,
            status: razorpayOrder.status,
            createdAt: new Date(),
          };

          res.json({
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            booking: {
              id: booking._id,
              hallName: booking.hall.name,
              date: booking.bookingDate,
              time: `${booking.startTime} - ${booking.endTime}`,
            },
            paymentMethod,
            key: process.env.RAZORPAY_KEY_ID,
            mode: "razorpay",
          });
        } catch (razorpayError) {
          console.error("Razorpay order creation failed:", razorpayError);
          return res.status(500).json({
            message: "Failed to create payment order",
            error: razorpayError.message
          });
        }
      } else {
        // SIMULATED PAYMENT (for testing/development)
        paymentOrder = {
          id: `order_${Date.now()}`,
          amount: Math.round(booking.totalAmount * 100), // Amount in paisa
          currency: "INR",
          booking: bookingId,
          user: req.user._id,
          paymentMethod,
          status: "created",
          createdAt: new Date(),
        };

        res.json({
          orderId: paymentOrder.id,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          booking: {
            id: booking._id,
            hallName: booking.hall.name,
            date: booking.bookingDate,
            time: `${booking.startTime} - ${booking.endTime}`,
          },
          paymentMethod,
          key: "rzp_test_simulated",
          mode: "simulated",
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route POST /api/payments/verify
// @desc Verify payment completion
// @access Private (User)
router.post(
  "/verify",
  [
    auth,
    body("bookingId").notEmpty().withMessage("Booking ID is required"),
    body("paymentId").notEmpty().withMessage("Payment ID is required"),
    body("orderId").notEmpty().withMessage("Order ID is required"),
    body("signature").optional(), // For payment gateway verification
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bookingId, paymentId, orderId, signature } = req.body;

      // Find booking
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check if booking belongs to user
      if (booking.user.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized for this booking" });
      }

      let paymentVerified = false;

      if (PAYMENT_MODE === "razorpay" && razorpayInstance && signature) {
        // REAL RAZORPAY PAYMENT VERIFICATION
        try {
          // Verify signature
          const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

          if (generatedSignature === signature) {
            paymentVerified = true;

          } else {
            console.error("❌ Razorpay signature verification failed");
            return res.status(400).json({
              message: "Payment verification failed - Invalid signature"
            });
          }
        } catch (verifyError) {
          console.error("Razorpay verification error:", verifyError);
          return res.status(500).json({
            message: "Payment verification failed",
            error: verifyError.message
          });
        }
      } else {
        // SIMULATED PAYMENT VERIFICATION (for testing/development)
        paymentVerified = true;

      }

      if (!paymentVerified) {
        return res.status(400).json({ message: "Payment verification failed" });
      }


      // Update booking payment status and mark as completed immediately
      booking.paymentStatus = "paid";
      booking.status = "completed"; // Automatically set to completed
      booking.razorpayPaymentId = paymentId;
      booking.razorpayOrderId = orderId;

      // Populate hall details before saving to get owner info
      await booking.populate('hall');

      await booking.save();

      // Automatically create revenue record when payment is successful
      try {
        const OwnerRevenue = require("../models/OwnerRevenue");
        const User = require("../models/User");

        // Populate user details if not already populated
        if (!booking.user.name) {
          await booking.populate('user', 'name email phone');
        }

        // Check if revenue record already exists for this booking
        const existingRevenue = await OwnerRevenue.findOne({ booking: booking._id });

        if (existingRevenue) {
        } else {
          // Calculate commission (100% to hall owner, 0% platform fee)
          const totalAmount = Math.abs(booking.totalAmount);
          const hallOwnerCommission = totalAmount; // 100% to hall owner
          const platformFee = 0; // 0% platform fee

          // Get hall owner ID
          const hallOwnerId = booking.hall.owner || booking.hall._id;
          // Create revenue record with all required fields
          const revenueRecord = new OwnerRevenue({
            booking: booking._id,
            hall: booking.hall._id,
            hallOwner: hallOwnerId,
            hallName: booking.hall.name,
            customer: booking.user._id,
            customerName: booking.user.name,
            customerEmail: booking.user.email,
            customerPhone: booking.user.phone || 'N/A',
            date: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            duration: booking.totalHours,
            totalAmount: totalAmount,
            hallOwnerCommission: hallOwnerCommission,
            platformFee: platformFee,
            status: "completed",
            transactionId: paymentId || `TXN_${booking._id}_${Date.now()}`,
            completedAt: new Date(),
            hallLocation: {
              city: booking.hall.location?.city,
              state: booking.hall.location?.state,
              address: booking.hall.location?.address
            },
            specialRequests: booking.specialRequests,
            paymentMethod: 'online'
          });

          await revenueRecord.save();
        }
      } catch (revenueError) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ ERROR CREATING REVENUE RECORD');
        console.error('='.repeat(60));
        console.error('Error:', revenueError.message);
        console.error('Stack:', revenueError.stack);
        console.error('Booking ID:', booking._id);
        console.error('Hall ID:', booking.hall?._id);
        console.error('Hall Name:', booking.hall?.name);
        console.error('Owner ID:', booking.hall?.owner);
        console.error('User ID:', booking.user?._id);
        console.error('User Name:', booking.user?.name);
        console.error('='.repeat(60) + '\n');
        // Don't fail the payment if revenue creation fails
        // Revenue can be created manually later if needed
      }

      // Create notification for hall owner
      try {
        const Notification = require("../models/Notification");

        // Get hall owner ID
        const hallOwnerId = booking.hall.owner;

        if (hallOwnerId) {
          const notification = new Notification({
            user: hallOwnerId,
            message: `New booking confirmed! ${booking.user.name} has successfully paid ₹${booking.totalAmount} for ${booking.hall.name} on ${new Date(booking.bookingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (${booking.startTime} - ${booking.endTime})`,
            type: "payment",
            relatedId: booking._id,
            isRead: false
          });

          await notification.save();
        } else {
        }
      } catch (notificationError) {
        console.error('❌ Error creating notification:', notificationError.message);
        // Don't fail the payment if notification creation fails
      }

      // Send email notifications
      try {
        const { sendBookingNotificationEmail, sendBookingConfirmationToCustomer } = require('../utils/emailService');
        const User = require('../models/User');

        // Get hall owner details
        const hallOwner = await User.findById(booking.hall.owner);

        if (hallOwner) {
          // Send email to hall owner
          const ownerEmailResult = await sendBookingNotificationEmail(
            hallOwner,
            booking,
            booking.user,
            booking.hall
          );

          if (ownerEmailResult.success) {
          } else {
          }

          // Send confirmation email to customer
          const customerEmailResult = await sendBookingConfirmationToCustomer(
            booking.user,
            booking,
            booking.hall
          );

          if (customerEmailResult.success) {

          } else {
          }
        } else {
        }
      } catch (emailError) {
        console.error('❌ Error sending emails:', emailError.message);
        // Don't fail the payment if email sending fails
      }


      // Notify admin via Telegram
      try {
        const { sendTelegramNotification } = require('../utils/emailService');
        const bookingDate = new Date(booking.bookingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const hallOwner = await require('../models/User').findById(booking.hall.owner).select('name email phone');
        const message = `💰 Payment Successful!\n\n 🏛 Hall: ${booking.hall.name}\n\n👤 Customer: ${booking.user.name}\n📧 Customer Email: ${booking.user.email}\n📞 Customer Phone: ${booking.user.phone || 'N/A'}\n\n -----------------Pay To -----------------\n\n👨‍💼 Owner: ${hallOwner?.name || 'N/A'}\n📧 Owner Email: ${hallOwner?.email || 'N/A'}\n📞 Owner Phone: ${hallOwner?.phone || 'N/A'}\n\n📅 Date: ${bookingDate}\n⏰ Time: ${booking.startTime} - ${booking.endTime}\n💵 Amount: ₹${booking.totalAmount}\n🆔 Payment ID: ${paymentId}`;
        await sendTelegramNotification(message);
      } catch (telegramError) {
        console.error('❌ Telegram notification failed:', telegramError.message);
      }


      // Populate booking details
      await booking.populate("user", "name email phone");
      await booking.populate({
        path: "hall",
        select: "name location pricePerHour owner",
        populate: {
          path: "owner",
          select: "name email phone"
        }
      });

      res.json({
        success: true,
        message: "Payment verified successfully. Booking confirmed.",
        booking: booking,
        payment: {
          id: paymentId,
          orderId,
          amount: booking.totalAmount,
          status: "paid",
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route GET /api/payments/history
// @desc Get payment history for user
// @access Private (User)
router.get("/history", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({
      user: req.user._id,
      paymentStatus: { $in: ["paid", "refunded"] },
    })
      .populate("hall", "name location")
      .sort({ updatedAt: -1 });

    const payments = bookings
      .filter((booking) => booking.hall) // Filter out bookings with deleted halls
      .map((booking) => ({
        id: `payment_${booking._id}`,
        bookingId: booking._id,
        hallName: booking.hall?.name || "Hall Unavailable",
        amount: booking.totalAmount,
        status: booking.paymentStatus,
        date: booking.updatedAt,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
      }));

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route POST /api/payments/refund/:bookingId
// @desc Request refund for a booking
// @access Private (User)
router.post("/refund/:bookingId", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if booking belongs to user
    if (booking.user.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized for this booking" });
    }

    // Check if payment was made
    if (booking.paymentStatus !== "paid") {
      return res
        .status(400)
        .json({ message: "No payment found for this booking" });
    }

    // Check if booking can be refunded (e.g., not completed yet)
    const bookingDateTime = new Date(
      `${booking.bookingDate.toDateString()} ${booking.startTime}`,
    );
    const now = new Date();
    const hoursBefore = (bookingDateTime - now) / (1000 * 60 * 60);

    if (hoursBefore < 24) {
      return res.status(400).json({
        message: "Refunds can only be requested 24 hours before booking",
      });
    }

    // Update payment status
    booking.paymentStatus = "refunded";
    booking.status = "cancelled";
    await booking.save();

    res.json({
      message: "Refund request processed successfully",
      refundAmount: booking.totalAmount,
      booking: booking._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
