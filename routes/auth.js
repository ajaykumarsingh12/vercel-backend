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

    const Notification = require("../models/Notification");

    // Prevent duplicate: if a pending request already exists, don't create another
    const existingRequest = await Notification.findOne({
      type: "unblock_request",
      relatedId: user._id,
      "requestData.status": "pending"
    });

    if (existingRequest) {
      return res.json({
        message: "Your unblock request is already pending. Admin will review it shortly.",
        success: true
      });
    }

    // Find first admin user
    const admin = await User.findOne({ role: "admin" });

    if (!admin) {
      return res.status(500).json({ message: "No admin found to process request" });
    }

    // Create a single notification
    await Notification.create({
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
    });

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

// @route POST /api/auth/google
// @desc Google OAuth login
// @access Public
router.post("/google", async (req, res) => {
  try {
    const { credential, role, sessionId } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    // If sessionId provided, retrieve role from database
    let selectedRole = role;
    if (sessionId) {
      try {
        const OnlineUser = require("../models/OnlineUser");
        const onlineUser = await OnlineUser.findOne({ sessionId });
        if (onlineUser) {
          selectedRole = onlineUser.selectedRole;
        }
      } catch (error) {
        console.error('Failed to retrieve session:', error);
      }
    }
    // Verify Google token
    const fetch = require("node-fetch");
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );
    const googleUser = await response.json();

    if (googleUser.error) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    const { email, name, picture } = googleUser;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email not provided by Google",
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({
          message: "Your account has been blocked. Please contact support for assistance.",
          isBlocked: true,
        });
      }

      // Update role if explicitly provided and different from current role
      // Only allow switching between user and hall_owner (not admin)
      if (selectedRole && (selectedRole === "user" || selectedRole === "hall_owner") && user.role !== selectedRole && user.role !== "admin") {
        user.role = selectedRole;
      }

      // Update profile image if not set
      if (!user.profileImage && picture) {
        user.profileImage = picture;
      }

      await user.save();
    } else {
      // Validate role (only user or hall_owner allowed)
      const userRole = selectedRole === "hall_owner" ? "hall_owner" : "user";
      // Create new user with Google data
      user = new User({
        name: name || email.split("@")[0],
        email,
        password: Math.random().toString(36).slice(-8) + "Aa1!", // Random password (won't be used)
        role: userRole,
        profileImage: picture,
        avatar: picture,
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
        department: user.department,
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({
      success: false,
      message: "Google login failed. Please try again.",
    });
  }
});

// @route POST /api/auth/apple
// @desc Apple Sign In
// @access Public
router.post("/apple", async (req, res) => {
  try {
    const { identityToken, user: appleUser, role } = req.body;

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        message: "Apple identity token is required",
      });
    }

    // Decode the identity token (JWT)
    const jwt = require("jsonwebtoken");
    const decoded = jwt.decode(identityToken);

    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid Apple token",
      });
    }

    const { email, sub: appleId } = decoded;
    const name = appleUser?.name
      ? `${appleUser.name.firstName || ""} ${appleUser.name.lastName || ""}`.trim()
      : email.split("@")[0];

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({
          message: "Your account has been blocked. Please contact support for assistance.",
          isBlocked: true,
        });
      }

      // Update role if explicitly provided and different from current role
      // Only allow switching between user and hall_owner (not admin)
      if (role && (role === "user" || role === "hall_owner") && user.role !== role && user.role !== "admin") {
        user.role = role;
      }

      await user.save();
    } else {
      // Validate role (only user or hall_owner allowed)
      const userRole = role === "hall_owner" ? "hall_owner" : "user";

      // Create new user with Apple data
      user = new User({
        name,
        email,
        password: Math.random().toString(36).slice(-8) + "Aa1!", // Random password (won't be used)
        role: userRole,
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
        department: user.department,
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Apple login error:", error);
    res.status(500).json({
      success: false,
      message: "Apple login failed. Please try again.",
    });
  }
});

// @route POST /api/auth/facebook
// @desc Facebook OAuth login
// @access Public
router.post("/facebook", async (req, res) => {
  try {
    const { accessToken, role, sessionId } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Facebook access token is required",
      });
    }

    // If sessionId provided, retrieve role from database
    let selectedRole = role;
    if (sessionId) {
      try {
        const OnlineUser = require("../models/OnlineUser");
        const onlineUser = await OnlineUser.findOne({ sessionId });
        if (onlineUser) {
          selectedRole = onlineUser.selectedRole;
        }
      } catch (error) {
        console.error('Failed to retrieve session:', error);
      }
    }
    // Verify Facebook token and get user data
    const fetch = require("node-fetch");
    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
    );
    const facebookUser = await response.json();
    if (facebookUser.error) {
      return res.status(401).json({
        success: false,
        message: "Invalid Facebook token",
      });
    }

    const { email, name, picture, id } = facebookUser;
    // If email is not provided, use Facebook ID as email
    let userEmail = email;
    if (!email) {
      userEmail = `facebook_${id}@facebook-user.com`;
    }
    // Check if user exists
    let user = await User.findOne({ email: userEmail });

    if (user) {
      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({
          message: "Your account has been blocked. Please contact support for assistance.",
          isBlocked: true,
        });
      }

      // Update role if explicitly provided and different from current role
      // Only allow switching between user and hall_owner (not admin)
      if (selectedRole && (selectedRole === "user" || selectedRole === "hall_owner") && user.role !== selectedRole && user.role !== "admin") {
        user.role = selectedRole;
      }

      // Update profile image if not set
      if (!user.profileImage && picture?.data?.url) {
        user.profileImage = picture.data.url;
      }

      await user.save();
    } else {
      // Validate role (only user or hall_owner allowed)
      const userRole = selectedRole === "hall_owner" ? "hall_owner" : "user";
      // Create new user with Facebook data
      user = new User({
        name: name || userEmail.split("@")[0],
        email: userEmail,
        password: Math.random().toString(36).slice(-8) + "Aa1!", // Random password (won't be used)
        role: userRole,
        profileImage: picture?.data?.url,
        avatar: picture?.data?.url,
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
        department: user.department,
        profileImage: user.profileImage,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Facebook login error:", error);
    res.status(500).json({
      success: false,
      message: "Facebook login failed. Please try again.",
    });
  }
});

