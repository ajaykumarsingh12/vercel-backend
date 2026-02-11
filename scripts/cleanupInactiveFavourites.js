const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const Favourite = require("../models/Favourite");

const cleanupInactiveFavourites = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Find all inactive favourites
    const inactiveFavourites = await Favourite.find({ isActive: false });
    console.log(`Found ${inactiveFavourites.length} inactive favourites`);

    if (inactiveFavourites.length === 0) {
      console.log("No inactive favourites to clean up");
      process.exit(0);
    }

    // Delete all inactive favourites
    const result = await Favourite.deleteMany({ isActive: false });
    console.log(`Deleted ${result.deletedCount} inactive favourites`);

    console.log("\nSummary:");
    console.log(`   - Inactive favourites found: ${inactiveFavourites.length}`);
    console.log(`   - Favourites deleted: ${result.deletedCount}`);
    console.log("\nCleanup completed successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
};

// Run the cleanup
cleanupInactiveFavourites();
