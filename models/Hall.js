const mongoose = require("mongoose");

const hallSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        required: true,
      },
      coordinates: {
        lat: {
          type: Number,
        },
        lng: {
          type: Number,
        },
      },
      googleMapsUrl: {
        type: String,
      },
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerHour: {
      type: Number,
      required: true,
      min: 0,
    },
    amenities: [
      {
        type: String,
      },
    ],
    images: [
      {
        type: String,
      },
    ],
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    availability: [
      {
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
      },
    ],
  },
  {
    timestamps: true,
  }
);


// MOST IMPORTANT - speeds up "my halls" query by 90%
hallSchema.index({ owner: 1 });

// Index for location searches (city/state filters)
hallSchema.index({ 'location.city': 1 });
hallSchema.index({ 'location.state': 1 });

// Compound index for public hall listing (homepage)
hallSchema.index({ isApproved: 1, isAvailable: 1 });

// Index for price range searches
hallSchema.index({ pricePerHour: 1 });

// Index for capacity searches
hallSchema.index({ capacity: 1 });

// Compound index for location + approval (most common query)
hallSchema.index({ 'location.city': 1, isApproved: 1, isAvailable: 1 });

// Text index for search functionality
hallSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model("Hall", hallSchema);
