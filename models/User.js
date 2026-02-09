const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function() {
        // Password is required only if not using OAuth
        return !this.googleId && !this.appleId;
      },
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "hall_owner", "admin"],
      default: "user",
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    businessName: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hall",
      },
    ],
    // OAuth fields
    googleId: {
      type: String,
      sparse: true,
    },
    appleId: {
      type: String,
      sparse: true,
    },
    avatar: {
      type: String,
    },
    profileImage: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    dateOfBirth: {
      type: Date,
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};


// Index for login queries (email lookup is very frequent)
userSchema.index({ email: 1 });

// Index for role-based queries (admin dashboard, hall owner queries)
userSchema.index({ role: 1 });

// Index for blocked user checks
userSchema.index({ isBlocked: 1 });

// Unique sparse indexes for OAuth lookups (prevents duplicates)
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ appleId: 1 }, { unique: true, sparse: true });

// Index for favorites array queries
userSchema.index({ favorites: 1 });

module.exports = mongoose.model("User", userSchema);
