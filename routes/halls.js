const express = require("express");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Hall = require("../models/Hall");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// Configure Multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Middleware to parse nested FormData fields
const parseFormData = (req, res, next) => {
  if (req.body["location[address]"]) {
    req.body.location = {
      address: req.body["location[address]"],
      city: req.body["location[city]"],
      state: req.body["location[state]"],
      pincode: req.body["location[pincode]"],
    };
  }
  if (req.body.amenities && !Array.isArray(req.body.amenities)) {
    req.body.amenities = [req.body.amenities];
  }
  if (req.body.availability) {
    try {
      req.body.availability = JSON.parse(req.body.availability);
    } catch (error) {
          }
  }
  next();
};

// @route  GET /api/halls
// @desc Get all halls (approved only for public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { city, state, minPrice, maxPrice, capacity, limit } = req.query;

    const filter = {
      $and: [
        { $or: [{ isApproved: true }, { isApproved: { $exists: false } }] },
        { $or: [{ isAvailable: true }, { isAvailable: { $exists: false } }] },
      ],
    };

    if (city) filter["location.city"] = new RegExp(`^${city}$`, "i");
    if (state) filter["location.state"] = new RegExp(`^${state}$`, "i");

    if (capacity) filter.capacity = { $gte: Number(capacity) };

    if (minPrice || maxPrice) {
      filter.pricePerHour = {};
      if (minPrice) filter.pricePerHour.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerHour.$lte = Number(maxPrice);
    }

    let query = Hall.find(filter).sort({ createdAt: -1 });

    // Add limit if specified
    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Number(limit));
    }

    const halls = await query;

    res.json(halls);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/halls/my-halls
// @desc Get halls owned by current user
// @access Private (Hall Owner)
router.get(
  "/my-halls",
  auth,
  authorize("hall_owner", "admin"),
  async (req, res) => {
    try {
      // Get all halls with owner populated
      const allHalls = await Hall.find().populate("owner", "name email _id").sort({ createdAt: -1 });
      const userId = req.user._id.toString();

      // Filter halls that belong to this user
      const userHalls = allHalls.filter(hall => {
        if (!hall.owner) {
          return false;
        }
        const ownerId = hall.owner._id.toString();
        const matches = ownerId === userId;
        return matches;
      });

      res.json(userHalls);
    } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route GET /api/halls/debug-user
// @desc Debug endpoint to check user info
// @access Private
router.get("/debug-user", auth, async (req, res) => {
  try {
    const allHalls = await Hall.find().populate("owner", "name email");
    const userHalls = allHalls.filter(hall => {
      if (!hall.owner) return false;
      return hall.owner._id.toString() === req.user._id.toString();
    });

    res.json({
      currentUser: {
        id: req.user._id.toString(),
        role: req.user.role,
        email: req.user.email
      },
      totalHalls: allHalls.length,
      userHalls: userHalls.length,
      hallOwners: allHalls.map(h => ({
        hallName: h.name,
        ownerId: h.owner?._id?.toString(),
        ownerEmail: h.owner?.email
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route GET /api/halls/all-my-halls
// @desc Get ALL halls for hall owner (temporary debug endpoint)
// @access Private
router.get("/all-my-halls", auth, async (req, res) => {
  try {
    // Just return ALL halls for now to debug
    const allHalls = await Hall.find()
      .populate("owner", "name email _id")
      .sort({ createdAt: -1 });

    res.json(allHalls);
  } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message, stack: error.stack });
  }
});

// @route GET /api/halls/:id
// @desc Get single hall by ID
// @access Public
router.get("/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate(
      "owner",
      "name email phone"
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json(hall);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/halls
// @desc Create a new hall
// @access Private (Hall Owner)
router.post(
  "/",
  [
    auth,
    authorize("hall_owner", "admin"),
    upload.array("images", 15),
    parseFormData,
    body("name").trim().notEmpty().withMessage("Hall name is required"),
    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required"),
    body("location.address")
      .trim()
      .notEmpty()
      .withMessage("Address is required"),
    body("location.city").trim().notEmpty().withMessage("City is required"),
    body("location.state").trim().notEmpty().withMessage("State is required"),
    body("location.pincode")
      .trim()
      .notEmpty()
      .withMessage("Pincode is required"),
    body("capacity")
      .isInt({ min: 1 })
      .withMessage("Capacity must be at least 1"),
    body("pricePerHour")
      .isFloat({ min: 0 })
      .withMessage("Price must be a positive number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const hallData = {
        ...req.body,
        owner: req.user._id,
        images: req.files
          ? req.files.map((file) => file.path.replace(/\\/g, "/"))
          : [],
      };

      const hall = new Hall(hallData);
      await hall.save();

      res.status(201).json(hall);
    } catch (error) {
            res.status(500).json({ message: "Server error" });
    }
  }
);

// @route PUT /api/halls/:id
// @desc Update a hall
// @route PUT /api/halls/:id
// @desc Update a hall
// @access Private (Hall Owner or Admin)
router.put(
  "/:id",
  [auth, upload.array("images", 15), parseFormData],
  async (req, res) => {
    try {
      const hall = await Hall.findById(req.params.id).populate("owner", "_id");

      if (!hall) {
        return res.status(404).json({ message: "Hall not found" });
      }

      // TEMPORARY: Allow hall_owner role to update any hall
      // Check if user is owner, admin, or hall_owner role
      const isOwner = hall.owner?._id
        ? hall.owner._id.toString() === req.user._id.toString()
        : hall.owner?.toString() === req.user._id.toString();
      const isAdmin = req.user.role === "admin";
      const isHallOwner = req.user.role === "hall_owner";

      if (!isOwner && !isAdmin && !isHallOwner) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this hall" });
      }

      // Handle image updates
      let updatedImages = hall.images; // Start with existing images

      // If existingImages array is provided, use it as the base
      if (req.body.existingImages) {
        if (Array.isArray(req.body.existingImages)) {
          updatedImages = req.body.existingImages;
        } else {
          updatedImages = [req.body.existingImages];
        }
      }

      // Add new uploaded images
      if (req.files && req.files.length > 0) {
        const newImagePaths = req.files.map((file) =>
          file.path.replace(/\\/g, "/")
        );
        updatedImages = [...updatedImages, ...newImagePaths];
      }

      // Update hall data
      const updateData = {
        ...req.body,
        images: updatedImages,
      };

      Object.assign(hall, updateData);
      await hall.save();

      res.json(hall);
    } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// @route DELETE /api/halls/:id
// @desc Delete a hall
// @access Private (Hall Owner or Admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate("owner", "_id");

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    // TEMPORARY: Allow hall_owner role to delete any hall
    // Check if user is owner, admin, or hall_owner role
    const isOwner = hall.owner?._id
      ? hall.owner._id.toString() === req.user._id.toString()
      : hall.owner?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    const isHallOwner = req.user.role === "hall_owner";

    if (!isOwner && !isAdmin && !isHallOwner) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this hall" });
    }

    await hall.deleteOne();
    res.json({ message: "Hall deleted successfully" });
  } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
  }
});

// @route POST /api/halls/:id/favorite
// @desc Toggle favorite status for a hall
// @access Private
router.post("/:id/favorite", auth, async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user._id);
    const hallId = req.params.id;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const index = user.favorites.indexOf(hallId);
    if (index === -1) {
      user.favorites.push(hallId);
      await user.save();
      res.json({ message: "Hall added to favorites", isFavorite: true });
    } else {
      user.favorites.splice(index, 1);
      await user.save();
      res.json({ message: "Hall removed from favorites", isFavorite: false });
    }
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/halls/favorites/all
// @desc Get all favorite halls for the current user
// @access Private
router.get("/favorites/all", auth, async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user._id).populate({
      path: "favorites",
      model: "Hall",
      populate: { path: "owner", select: "name email phone" }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user.favorites);
  } catch (error) {
        res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
