const cloudinary = require('cloudinary').v2;
const path = require('path');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadVideo() {
  try {
    console.log('🎬 Uploading video to Cloudinary...');
    
    const videoPath = path.join(__dirname, '../../frontend/public/videos/video.mp4');
    
    const result = await cloudinary.uploader.upload(videoPath, {
      resource_type: 'video',
      folder: 'hall-booking/videos',
      public_id: 'hero-video',
      overwrite: true,
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    console.log('Video uploaded successfully!');
    console.log('Video URL:', result.secure_url);
    console.log('Thumbnail URL:', result.secure_url.replace('.mp4', '.jpg'));
    console.log('\n Copy this URL to your HeroSection.jsx:');
    console.log(`src: "${result.secure_url}",`);
    console.log(`poster: "${result.secure_url.replace('.mp4', '.jpg')}"`);
    
  } catch (error) {
    console.error(' Error uploading video:', error.message);
  }
}

uploadVideo();
