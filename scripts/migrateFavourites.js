const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const Favourite = require("../models/Favourite");

dotenv.config();

const migrateFavourites = async () => {
  try {
    console.log(" Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    console.log("\nStarting favourites migration...");

    // Get all users with favorites
    const users = await User.find({ favorites: { $exists: true, $ne: [] } });
    console.log(`Found ${users.length} users with favorites`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      console.log(`\nProcessing user: ${user.email} (${user.favorites.length} favorites)`);

      for (const hallId of user.favorites) {
        try {
          // Check if favourite already exists
          const existing = await Favourite.findOne({
            user: user._id,
            hall: hallId,
          });

          if (existing) {
            console.log(`  ⏭️  Skipped: Favourite already exists for hall ${hallId}`);
            skippedCount++;
            continue;
          }

          // Create new favourite
          await Favourite.create({
            user: user._id,
            hall: hallId,
            isActive: true,
            priority: "medium",
          });

          console.log(`  Migrated: Hall ${hallId}`);
          migratedCount++;
        } catch (error) {
          console.error(`  Error migrating hall ${hallId}:`, error.message);
          errorCount++;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Migration Summary:");
    console.log("=".repeat(60));
    console.log(`Successfully migrated: ${migratedCount} favourites`);
    console.log(`Skipped (already exist): ${skippedCount} favourites`);
    console.log(`Errors: ${errorCount} favourites`);
    console.log(`Total processed: ${migratedCount + skippedCount + errorCount} favourites`);
    console.log("=".repeat(60));

    console.log("\nMigration completed successfully!");
    console.log("\n💡 Note: The User.favorites field has been removed from the User model.");
    console.log("   All favorites are now stored in the Favourite collection.\n");

    process.exit(0);
  } catch (error) {
    console.error("\n Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         Favourites Collection Migration Script            ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("\nThis script will migrate existing favorites from User model");
console.log("to the new Favourite collection.\n");

migrateFavourites();
