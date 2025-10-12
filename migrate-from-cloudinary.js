// Migration script from Cloudinary to other storage providers
const cloudinary = require('cloudinary').v2;
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure destination storage (example: AWS S3)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1'
});

// Migration function
async function migrateFromCloudinary() {
  try {
    console.log('Starting migration from Cloudinary...');
    
    // Get all resources from Cloudinary
    const result = await cloudinary.search
      .expression('*')
      .max_results(500) // Adjust based on your data size
      .execute();
    
    console.log(`Found ${result.total_count} resources to migrate`);
    
    // Process each resource
    for (const resource of result.resources) {
      try {
        console.log(`Migrating: ${resource.public_id}`);
        
        // Download original image from Cloudinary
        const imageUrl = cloudinary.url(resource.public_id, {
          secure: true,
          resource_type: resource.resource_type
        });
        
        // Download the image
        const response = await fetch(imageUrl);
        const imageBuffer = await response.buffer();
        
        // Upload to destination storage (S3 example)
        const uploadParams = {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `${resource.public_id}.${resource.format}`,
          Body: imageBuffer,
          ContentType: `image/${resource.format}`,
          Metadata: {
            'cloudinary-id': resource.public_id,
            'original-size': resource.bytes.toString(),
            'uploaded-at': resource.created_at
          }
        };
        
        await s3.upload(uploadParams).promise();
        console.log(`✅ Migrated: ${resource.public_id}`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Failed to migrate ${resource.public_id}:`, error.message);
      }
    }
    
    console.log('Migration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run migration
migrateFromCloudinary();
