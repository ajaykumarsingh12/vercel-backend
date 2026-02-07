const mongoose = require("mongoose");

const hallAllotedSchema = new mongoose.Schema(
  {
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function() {
        return !this.isAvailabilitySlot;
      },
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: function() {
        return !this.isAvailabilitySlot;
      },
    },
    allotmentDate: {
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
    duration: {
      type: Number, // in hours
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "partial", "not_applicable"],
      default: "pending",
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "completed", "no_show", "available"],
      default: "confirmed",
    },
    specialRequirements: {
      type: String,
      trim: true,
    },
    actualCheckIn: {
      type: Date,
    },
    actualCheckOut: {
      type: Date,
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        trim: true,
      },
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancellationDate: {
      type: Date,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    hallOwnerCommission: {
      type: Number,
      default: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPattern: {
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
      },
      endDate: {
        type: Date,
      },
      occurrences: {
        type: Number,
      },
    },
    additionalServices: [{
      name: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      quantity: {
        type: Number,
        default: 1,
      },
    }],
    notes: {
      type: String,
      trim: true,
    },
    isAvailabilitySlot: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
hallAllotedSchema.index({ hall: 1, allotmentDate: 1 });
hallAllotedSchema.index({ user: 1, allotmentDate: 1 });
hallAllotedSchema.index({ status: 1 });
hallAllotedSchema.index({ paymentStatus: 1 });
hallAllotedSchema.index({ allotmentDate: 1 });
hallAllotedSchema.index({ isAvailabilitySlot: 1 });

// Virtual for calculating remaining amount
hallAllotedSchema.virtual('remainingAmount').get(function() {
  return this.totalAmount - this.amountPaid;
});

// Virtual for calculating net earnings (after platform fee)
hallAllotedSchema.virtual('netEarnings').get(function() {
  return this.totalAmount - this.platformFee;
});

// Pre-save middleware to update hall availability
hallAllotedSchema.pre('save', async function(next) {
  if (this.isNew && this.status === 'confirmed') {
    try {
      const Hall = mongoose.model('Hall');
      await Hall.findByIdAndUpdate(this.hall, {
        $push: {
          availability: {
            date: this.allotmentDate,
            startTime: this.startTime,
            endTime: this.endTime,
            isBooked: true,
            bookingId: this._id
          }
        }
      });
    } catch (error) {
      console.error(error);
    }
  }
  next();
});

// Static methods
hallAllotedSchema.statics.getHallAllotments = function(hallId, startDate, endDate) {
  return this.find({
    hall: hallId,
    allotmentDate: {
      $gte: startDate,
      $lte: endDate
    },
    status: { $in: ['confirmed', 'completed'] }
  }).populate('user', 'name email')
    .populate('booking', 'bookingDate')
    .sort({ allotmentDate: 1, startTime: 1 });
};

hallAllotedSchema.statics.getUserAllotments = function(userId, limit = 10, skip = 0) {
  return this.find({ user: userId })
    .populate('hall', 'name location images')
    .populate('booking', 'bookingDate')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

hallAllotedSchema.statics.getRevenueStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        allotmentDate: { $gte: startDate, $lte: endDate },
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
        totalAllotments: { $sum: 1 },
        averageAmount: { $avg: '$totalAmount' }
      }
    }
  ]);
};

module.exports = mongoose.model("HallAlloted", hallAllotedSchema);
