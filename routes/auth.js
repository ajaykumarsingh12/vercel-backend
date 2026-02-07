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
    body("role").optional().isIn(["user", "hall_owner", "admin"]),
  ],
  async (req, res) => {
    try {
      // 1. Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          message: errors.array()?.[0]?.msg || "Validation error",
        });
      }

      const { name, email, password, role, phone } = req.body;

      // 2. Check for existing user
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, message: "Email already registered" });
      }

      // 3. Create User (Ensure your User model hashes the password via pre-save hook)
      const user = new User({
        name,
        email,
        password,
        role: role || "user",
        phone: phone && typeof phone === "string" ? phone.trim() : undefined,
      });

      await user.save();

      // 4. Generate Token & Respond
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
          favorites: user.favorites || [],
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

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check password
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
          favorites: user.favorites || [],
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
        favorites: req.user.favorites || [],
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
        favorites: user.favorites || [],
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
      const normalizedEmail = email.toLowerCase().trim();

      // Escape special regex characters to prevent injection
      const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Check if user exists with case-insensitive search
      const user = await User.findOne({
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
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

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Update password (will be hashed by pre-save hook)
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

// @route POST /api/auth/google
// @desc Google OAuth login/register
// @access Public
router.post("/google", async (req, res) => {
  try {
    const { credential, clientId } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    // Decode the JWT token from Google
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const googleUser = JSON.parse(jsonPayload);

    // Check if user exists
    let user = await User.findOne({ email: googleUser.email });

    if (user) {
      // Update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleUser.sub;
        user.authProvider = "google";
        user.isVerified = true;
        if (googleUser.picture) user.avatar = googleUser.picture;
        await user.save();
      }
    } else {
      // Create new user
      user = new User({
        name: googleUser.name,
        email: googleUser.email,
        googleId: googleUser.sub,
        avatar: googleUser.picture,
        authProvider: "google",
        isVerified: true,
        role: "user",
      });
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
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
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
        favorites: user.favorites || [],
      },
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({
      success: false,
      message: "Google authentication failed",
    });
  }
});

// @route POST /api/auth/apple
// @desc Apple OAuth login/register
// @access Public
router.post("/apple", async (req, res) => {
  try {
    const { identityToken, user: appleUser } = req.body;

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        message: "Apple identity token is required",
      });
    }

    // Decode the JWT token from Apple
    const base64Url = identityToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const applePayload = JSON.parse(jsonPayload);

    // Extract email and Apple ID
    const email = applePayload.email;
    const appleId = applePayload.sub;

    if (!email || !appleId) {
      return res.status(400).json({
        success: false,
        message: "Invalid Apple credentials",
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // Update Apple ID if not set
      if (!user.appleId) {
        user.appleId = appleId;
        user.authProvider = "apple";
        user.isVerified = true;
        await user.save();
      }
    } else {
      // Create new user
      // Apple provides name only on first sign-in
      const userName = appleUser?.name
        ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim()
        : email.split('@')[0];

      user = new User({
        name: userName,
        email: email,
        appleId: appleId,
        authProvider: "apple",
        isVerified: true,
        role: "user",
      });
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
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
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
        favorites: user.favorites || [],
      },
    });
  } catch (error) {
      console.error(error);
    res.status(500).json({
      success: false,
      message: "Apple authentication failed",
    });
  }
});

module.exports = router;