const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

// @route GET /api/geocoding/search
// @desc Search for addresses using OpenStreetMap Nominatim
// @access Public
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Query must be at least 3 characters",
      });
    }

    // Fetch from OpenStreetMap Nominatim API
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(q)}&` +
        `format=json&` +
        `addressdetails=1&` +
        `countrycodes=in&` +
        `limit=5`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "BookMyHall/1.0 (Hall Booking Application)",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `OpenStreetMap API Error: ${response.status} ${response.statusText}`
      );
      return res.status(response.status).json({
        success: false,
        message: "Failed to fetch location suggestions",
      });
    }

    const data = await response.json();

    res.json({
      success: true,
      results: data,
    });
  } catch (error) {
    console.error("Geocoding search error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route GET /api/geocoding/reverse
// @desc Reverse geocode coordinates to address
// @access Public
router.get("/reverse", async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates",
      });
    }

    // Fetch from OpenStreetMap Nominatim API
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
        `lat=${latitude}&` +
        `lon=${longitude}&` +
        `format=json&` +
        `addressdetails=1`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "BookMyHall/1.0 (Hall Booking Application)",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `OpenStreetMap API Error: ${response.status} ${response.statusText}`
      );
      return res.status(response.status).json({
        success: false,
        message: "Failed to reverse geocode location",
      });
    }

    const data = await response.json();

    res.json({
      success: true,
      result: data,
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
