const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Hall = require('../models/Hall');

const fixPendingHalls = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all halls where isApproved is false
    // These are likely pending halls (not explicitly rejected by admin)
    const halls = await Hall.find({ isApproved: false });
    
    console.log(`Found ${halls.length} halls with isApproved: false`);
    
    // Update them to undefined (pending state)
    // Note: You should manually verify which ones are actually rejected vs pending
    const result = await Hall.updateMany(
      { isApproved: false },
      { $unset: { isApproved: "" } }
    );
    
    console.log(`Updated ${result.modifiedCount} halls to pending state`);
    console.log('Migration complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

fixPendingHalls();
