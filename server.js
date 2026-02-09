const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BookMyHall API is running!",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      users: "/api/users",
      halls: "/api/halls",
      bookings: "/api/bookings",
      reviews: "/api/reviews",
      payments: "/api/payments",
      admin: "/api/admin",
      notifications: "/api/notifications",
      hallAlloted: "/api/hallalloted",
      ownerRevenue: "/api/owner-revenue"
    },
    documentation: "https://github.com/yourusername/bookmyhall",
    status: "operational"
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/halls", require("./routes/halls"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/hallalloted", require("./routes/hallAlloted"));
app.use("/api/owner-revenue", require("./routes/ownerRevenue"));



// 404 handler - Route not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      "/",
      "/api/health",
      "/api/auth",
      "/api/users",
      "/api/halls",
      "/api/bookings",
      "/api/reviews",
      "/api/payments",
      "/api/admin",
      "/api/hallalloted",
      "/api/owner-revenue"
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});


mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    
    // Only start server if not in Vercel (Vercel handles this)
    if (process.env.VERCEL !== '1') {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    }
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if (process.env.VERCEL !== '1') {
    process.exit(1);
  }
});

// Export for Vercel
module.exports = app;
