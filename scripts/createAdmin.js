require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Read admin data from environment variables
    const adminData = {
      name: process.env.ADMIN_NAME || 'Admin User',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
      phone: process.env.ADMIN_PHONE || '0000000000',
      role: 'admin',
      isVerified: true
    };

    // Validate that environment variables are set
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log('\nWARNING: Admin credentials not found in .env file!');
      console.log('\nPlease add these to your backend/.env file:');
      console.log('ADMIN_NAME=Your Name');
      console.log('ADMIN_EMAIL=your.email@example.com');
      console.log('ADMIN_PASSWORD=YourSecurePassword123!');
      console.log('ADMIN_PHONE=1234567890\n');
      process.exit(1);
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('\n Admin with this email already exists!');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Role: ${existingAdmin.role}`);
      console.log(`Name: ${existingAdmin.name}`);
      console.log('\nIf you forgot your password, you can reset it from the admin login page.\n');
      process.exit(1);
    }

    // Create admin user
    const admin = new User(adminData);
    await admin.save();

    console.log('\n✅ SUCCESS! Admin account created!');
    console.log('================================');
    console.log(`Name:  ${admin.name}`);
    console.log(`Email: ${admin.email}`);
    console.log(`Phone: ${admin.phone}`);
    console.log(`Role:  ${admin.role}`);
    console.log('================================');
    console.log('\nNEXT STEPS:');
    console.log('1. Login at: /admin/login');
    console.log('2. Change your password immediately after first login');
    console.log('3. Remove admin credentials from .env file for security');
    console.log('\n✅ You can now access the admin dashboard!\n');

    process.exit(0);
  } catch (error) {
    console.error('\nError creating admin:', error.message);
    if (error.name === 'ValidationError') {
      console.error('\nValidation errors:');
      Object.keys(error.errors).forEach(key => {
        console.error(`   - ${key}: ${error.errors[key].message}`);
      });
    }
    console.log('');
    process.exit(1);
  }
};

// Run the script
createAdmin();
