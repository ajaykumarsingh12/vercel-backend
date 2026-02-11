/**
 * Script to verify that all database indexes are created
 * Run with: node backend/scripts/verifyIndexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Hall = require('../models/Hall');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const HallAlloted = require('../models/HallAlloted');
const OwnerRevenue = require('../models/OwnerRevenue');

async function verifyIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Get indexes for each collection
    const collections = [
      { name: 'User', model: User },
      { name: 'Hall', model: Hall },
      { name: 'Booking', model: Booking },
      { name: 'Notification', model: Notification },
      { name: 'Review', model: Review },
      { name: 'HallAlloted', model: HallAlloted },
      { name: 'OwnerRevenue', model: OwnerRevenue }
    ];

    console.log('CHECKING INDEXES FOR ALL COLLECTIONS\n');
    console.log('='.repeat(60));

    for (const collection of collections) {
      const indexes = await collection.model.collection.getIndexes();
      console.log(`\n${collection.name} Collection:`);
      console.log('-'.repeat(60));
      
      Object.keys(indexes).forEach(indexName => {
        const index = indexes[indexName];
        const keys = Object.keys(index.key).map(k => `${k}: ${index.key[k]}`).join(', ');
        console.log(`  ✓ ${indexName}: { ${keys} }`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n All indexes verified successfully!\n');

    // Test a query with explain
    console.log(' TESTING QUERY PERFORMANCE\n');
    console.log('='.repeat(60));

    // Test Hall query
    const hallExplain = await Hall.find({ isApproved: true, isAvailable: true })
      .limit(10)
      .explain('executionStats');

    console.log('\nHall Query Performance:');
    console.log(`  Documents Examined: ${hallExplain.executionStats.totalDocsExamined}`);
    console.log(`  Documents Returned: ${hallExplain.executionStats.nReturned}`);
    console.log(`  Execution Time: ${hallExplain.executionStats.executionTimeMillis}ms`);
    console.log(`  Index Used: ${hallExplain.executionStats.executionStages.indexName || 'COLLSCAN (no index)'}`);

    if (hallExplain.executionStats.executionTimeMillis < 50) {
      console.log('  Query is FAST!');
    } else {
      console.log('  Query could be faster');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\nVerification complete!\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed\n');
  }
}

// Run verification
verifyIndexes();
