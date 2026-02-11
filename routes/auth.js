const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// @route POST /api/auth/register
// @desc Register a new user
// @access Public
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be 6+ chars"),
    body("role").optional().isIn(["user", "hall_owner"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          message: errors.array()?.[0]?.msg || "Validation error",
        });
      }

      const { name, email, password, role, phone } = req.body;

      // 🔒 SECURITY: Block admin registration attempts
      if (role === "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin accounts cannot be created through registration. Contact system administrator.",
        });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, message: "Email already registered" });
      }

      // 🔒 SECURITY: Force role to be either "user" or "hall_owner", never "admin"
      const userRole = role === "hall_owner" ? "hall_owner" : "user";

      const user = new User({
        name,
        email,
        password,
        role: userRole,
        phone: phone && typeof phone === "string" ? phone.trim() : undefined,
      });

      await user.save();

      const token = generateToken(user._id);

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          businessName: user.businessName,
          department: user.department,
          profileImage: user.profileImage,
          bio: user.bio,
          dateOfBirth: user.dateOfBirth,
          avatar: user.avatar,
        },
      });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  },
);

// @route POST /api/auth/login
// @desc Login user
// @access Public
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array(),
          message: errors.array()?.[0]?.msg || "Validation error",
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been blocked. Please contact support for assistance.",
          isBlocked: true 
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateToken(user._id);

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          businessName: user.businessName,
          department: user.department,
          profileImage: user.profileImage,
          bio: user.bio,
          dateOfBirth: user.dateOfBirth,
          avatar: user.avatar,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

// @route GET /api/auth/me
// @desc Get current user
// @access Private
router.get("/me", auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        phone: req.user.phone,
        address: req.user.address,
        businessName: req.user.businessName,
        department: req.user.department,
        profileImage: req.user.profileImage,
        bio: req.user.bio,
        dateOfBirth: req.user.dateOfBirth,
        avatar: req.user.avatar,
      },
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route PUT /api/auth/profile
// @desc Update user profile
// @access Private
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, email, phone, address, businessName } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (businessName !== undefined) updateData.businessName = businessName;

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        businessName: user.businessName,
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
      },
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/auth/verify-email
// @desc Verify if email exists in the system
// @access Public
router.post(
  "/verify-email",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address",
        });
      }

      const { email } = req.body;

      // Simple case-insensitive email check
      const user = await User.findOne({ 
        email: email.toLowerCase().trim() 
      });

      res.json({
        success: true,
        exists: !!user,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

// @route POST /api/auth/reset-password
// @desc Reset user password
// @access Public
router.post(
  "/reset-password",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0]?.msg || "Validation error",
        });
      }

      const { email, newPassword } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

// @route POST /api/auth/request-unblock
// @desc Request account unblock
// @access Public
router.post("/request-unblock", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isBlocked) {
      return res.status(400).json({ message: "Account is not blocked" });
    }

    // Find all admin users
    const admins = await User.find({ role: "admin" });

    if (admins.length === 0) {
      return res.status(500).json({ message: "No admin found to process request" });
    }

    // Create notification for each admin
    const Notification = require("../models/Notification");
    
    const notificationPromises = admins.map(admin => 
      Notification.create({
        user: admin._id,
        type: "unblock_request",
        message: `${user.name} (${user.role === 'hall_owner' ? 'Hall Owner' : 'User'}) has requested to unblock their account`,
        relatedId: user._id,
        requestData: {
          userEmail: email,
          userName: user.name,
          userRole: user.role,
          requestedAt: new Date(),
          status: "pending"
        }
      })
    );

    await Promise.all(notificationPromises);

    console.log(`Unblock request created for: ${email} (${user.name}) - Role: ${user.role}`);

    res.json({ 
      message: "Unblock request sent successfully. Admin will review your request.",
      success: true 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
