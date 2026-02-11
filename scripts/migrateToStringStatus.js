const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const migrateToStringStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const hallsCollection = db.collection('halls');

    // Get all halls
    const halls = await hallsCollection.find({}).toArray();
    console.log(`Found ${halls.length} halls to migrate`);

    let updated = 0;

    for (const hall of halls) {
      let newStatus;
      
      if (hall.isApproved === true) {
        newStatus = 'approved';
      } else if (hall.isApproved === false) {
        newStatus = 'rejected';
      } else {
        newStatus = 'pending';
      }

      await hallsCollection.updateOne(
        { _id: hall._id },
        { $set: { isApproved: newStatus } }
      );
      
      updated++;
      console.log(`Updated hall ${hall.name}: ${hall.isApproved} -> ${newStatus}`);
    }

    console.log(`\nMigration complete! Updated ${updated} halls.`);
    console.log('- Approved halls: now have isApproved: "approved"');
    console.log('- Rejected halls: now have isApproved: "rejected"');
    console.log('- Pending halls: now have isApproved: "pending"');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

migrateToStringStatus();
