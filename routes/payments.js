const express = require("express");
const { body, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const { auth } = require("../middleware/auth");

const router = express.Router();

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

      // Create payment order (mock implementation)
      const paymentOrder = {
        id: `order_${Date.now()}`,
        amount: booking.totalAmount * 100, // Amount in paisa
        currency: "INR",
        booking: bookingId,
        user: req.user._id,
        paymentMethod,
        status: "created",
        createdAt: new Date(),
      };

      // In a real implementation, you would integrate with payment gateway here
      // For now, we'll simulate the payment order creation

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
        // In real implementation, this would include gateway-specific data
        key: process.env.RAZORPAY_KEY_ID || "rzp_test_key", // For Razorpay or similar
      });
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

      const { bookingId, paymentId, orderId } = req.body;

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

      // In a real implementation, you would verify the payment with the gateway
      // For now, we'll simulate payment verification

      // Update booking payment status
      booking.paymentStatus = "paid";
      booking.status = "confirmed"; // Auto-confirm booking on successful payment
      await booking.save();

      await booking.populate("user", "name email");
      await booking.populate("hall", "name location pricePerHour");

      res.json({
        success: true,
        message: "Payment verified successfully",
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
