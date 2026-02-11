const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    // Connection already exists - no need to log every time
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isConnected = false;
    // Don't throw error - let API respond even if DB is down
  }
};

// Middleware to ensure DB connection before each request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('DB connection middleware error:', error);
    next();
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
    status: "operational",
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[dbStatus] || 'unknown';

  res.json({
    success: true,
    message: "Server is running",
    database: dbStatusText,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Favicon handler (prevents 404 in logs)
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
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
app.use("/api/geocoding", require("./routes/geocoding"));
app.use("/api/favourites", require("./routes/favourites"));


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
      "/api/notifications",
      "/api/hallalloted",
      "/api/owner-revenue"
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { 
      stack: err.stack,
      error: err.toString()
    })
  });
});

// ============================================
// SERVER START (Local Development Only)
// ============================================
if (process.env.VERCEL !== '1' && require.main === module) {
  connectDB().then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    });
  }).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

// Export for Vercel
module.exports = app;
