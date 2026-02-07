const mongoose = require("mongoose");
const HallAlloted = require("../models/HallAlloted");
const Hall = require("../models/Hall");
const User = require("../models/User");
const Booking = require("../models/Booking");
require("dotenv").config();

const seedHallAllotments = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/bookmyhall");

    // Clear existing hall allotments
    await HallAlloted.deleteMany({});

    // Get sample data
    const halls = await Hall.find({ isApproved: true }).limit(10);
    const users = await User.find({ role: "user" }).limit(20);
    const bookings = await Booking.find({}).limit(15);

    if (halls.length === 0 || users.length === 0) {
      return;
    }

    const sampleAllotments = [];

    // Generate sample hall allotments
    for (let i = 0; i < 15; i++) {
      const hall = halls[Math.floor(Math.random() * halls.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      const booking = bookings[Math.floor(Math.random() * bookings.length)];

      // Generate random date within the next 30 days
      const allotmentDate = new Date();
      allotmentDate.setDate(allotmentDate.getDate() + Math.floor(Math.random() * 30));

      // Generate random time slots
      const startHour = Math.floor(Math.random() * 14) + 6; // 6 AM to 8 PM
      const duration = Math.floor(Math.random() * 6) + 1; // 1 to 6 hours
      const startTime = `${startHour.toString().padStart(2, '0')}:00`;
      const endTime = `${(startHour + duration).toString().padStart(2, '0')}:00`;

      const totalAmount = hall.pricePerHour * duration;
      const platformFee = totalAmount * 0.05;
      const hallOwnerCommission = totalAmount * 0.9;

      // Random status
      const statuses = ['confirmed', 'completed', 'cancelled'];
      const paymentStatuses = ['paid', 'pending', 'partial'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const paymentStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];

      const amountPaid = paymentStatus === 'paid' ? totalAmount :
        paymentStatus === 'partial' ? totalAmount * 0.5 : 0;

      const allotment = {
        hall: hall._id,
        user: user._id,
        booking: booking._id,
        allotmentDate,
        startTime,
        endTime,
        duration,
        totalAmount,
        platformFee,
        hallOwnerCommission,
        paymentStatus,
        amountPaid,
        status,
        specialRequirements: Math.random() > 0.7 ? "Extra chairs and tables needed" : null,
        additionalServices: Math.random() > 0.8 ? [
          {
            name: "Catering Service",
            price: 500,
            quantity: 1
          }
        ] : [],
        notes: Math.random() > 0.9 ? "Please arrange parking space" : null
      };

      // Add check-in/check-out times for completed allotments
      if (status === 'completed') {
        allotment.actualCheckIn = new Date(allotmentDate);
        allotment.actualCheckIn.setHours(startHour);
        allotment.actualCheckOut = new Date(allotmentDate);
        allotment.actualCheckOut.setHours(startHour + duration);

        // Add feedback for some completed allotments
        if (Math.random() > 0.5) {
          allotment.feedback = {
            rating: Math.floor(Math.random() * 3) + 3, // 3-5 stars
            comment: "Great experience! Hall was clean and well-maintained."
          };
        }
      }

      // Add cancellation details for cancelled allotments
      if (status === 'cancelled') {
        allotment.cancellationReason = "Event was postponed";
        allotment.cancellationDate = new Date();
        allotment.refundAmount = totalAmount * 0.8; // 80% refund
      }

      sampleAllotments.push(allotment);
    }

    // Insert sample allotments
    await HallAlloted.insertMany(sampleAllotments);

    // Display statistics
    const stats = await HallAlloted.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

  } catch (error) {
      console.error(error);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the seeder
if (require.main === module) {
  seedHallAllotments();
}

module.exports = seedHallAllotments;
