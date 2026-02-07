const mongoose = require("mongoose");

const ownerRevenueSchema = new mongoose.Schema(
  {
    hallOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },
    hallName: {
      type: String,
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    hallOwnerCommission: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFee: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["completed", "refunded"],
      default: "completed",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    customerName: {
      type: String,
    },
    customerEmail: {
      type: String,
    },
    hallLocation: {
      city: String,
      state: String,
      address: String
    },
    duration: {
      type: Number, // in hours
    },
    specialRequests: {
      type: String,
    },
    paymentMethod: {
      type: String,
      default: "online"
    },
    transactionId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
ownerRevenueSchema.index({ hallOwner: 1, createdAt: -1 });
ownerRevenueSchema.index({ hall: 1, date: -1 });
ownerRevenueSchema.index({ date: -1 });
ownerRevenueSchema.index({ status: 1 });

// Static method to get total revenue for a hall owner
ownerRevenueSchema.statics.getTotalRevenue = async function(hallOwnerId, startDate, endDate) {
  const match = { 
    hallOwner: new mongoose.Types.ObjectId(hallOwnerId),
    status: "completed"
  };
  
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" }, // Use totalAmount instead of hallOwnerCommission
        totalBookings: { $sum: 1 },
        totalPlatformFees: { $sum: "$platformFee" }
      }
    }
  ]);

  return result[0] || { totalRevenue: 0, totalBookings: 0, totalPlatformFees: 0 };
};

// Static method to get revenue by hall
ownerRevenueSchema.statics.getRevenueByHall = async function(hallOwnerId, startDate, endDate) {
  const match = { 
    hallOwner: new mongoose.Types.ObjectId(hallOwnerId),
    status: "completed"
  };
  
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$hall",
        hallName: { $first: "$hallName" },
        totalRevenue: { $sum: "$totalAmount" }, // Use totalAmount instead of hallOwnerCommission
        totalBookings: { $sum: 1 }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);
};

// Static method to get monthly revenue stats
ownerRevenueSchema.statics.getMonthlyStats = async function(hallOwnerId, year) {
  const match = { 
    hallOwner: new mongoose.Types.ObjectId(hallOwnerId),
    status: "completed"
  };
  
  if (year) {
    match.date = {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1)
    };
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" }
        },
        totalRevenue: { $sum: "$totalAmount" }, // Use totalAmount instead of hallOwnerCommission
        totalBookings: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
};

module.exports = mongoose.model("OwnerRevenue", ownerRevenueSchema);