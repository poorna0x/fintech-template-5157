// Migration script from Cloudinary to Cloudflare R2
const cloudinary = require('cloudinary').v2;
const AWS = require('aws-sdk');
const fetch = require('node-fetch');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudflare R2 (S3-compatible)
const r2 = new AWS.S3({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  region: 'auto',
  s3ForcePathStyle: true
});

async function migrateToCloudflareR2() {
  try {
    console.log('🚀 Starting migration to Cloudflare R2...');
    
    // Get all resources from Cloudinary
    let nextCursor = null;
    let totalMigrated = 0;
    
    do {
      const searchParams = {
        expression: '*',
        max_results: 100
      };
      
      if (nextCursor) {
        searchParams.next_cursor = nextCursor;
      }
      
      const result = await cloudinary.search.execute(searchParams);
      
      console.log(`📦 Processing batch of ${result.resources.length} resources...`);
      
      // Process each resource in parallel (with concurrency limit)
      const concurrency = 5;
      for (let i = 0; i < result.resources.length; i += concurrency) {
        const batch = result.resources.slice(i, i + concurrency);
        
        await Promise.all(batch.map(async (resource) => {
          try {
            // Get original image URL
            const imageUrl = cloudinary.url(resource.public_id, {
              secure: true,
              resource_type: resource.resource_type,
              format: resource.format
            });
            
            // Download image
            const response = await fetch(imageUrl);
            if (!response.ok) {
              throw new Error(`Failed to download: ${response.statusText}`);
            }
            
            const imageBuffer = await response.buffer();
            
            // Upload to Cloudflare R2
            const uploadParams = {
              Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
              Key: `${resource.public_id}.${resource.format}`,
              Body: imageBuffer,
              ContentType: `image/${resource.format}`,
              Metadata: {
                'cloudinary-id': resource.public_id,
                'original-size': resource.bytes.toString(),
                'uploaded-at': resource.created_at,
                'width': resource.width.toString(),
                'height': resource.height.toString()
              }
            };
            
            await r2.upload(uploadParams).promise();
            
            totalMigrated++;
            console.log(`✅ [${totalMigrated}] Migrated: ${resource.public_id}`);
            
          } catch (error) {
            console.error(`❌ Failed to migrate ${resource.public_id}:`, error.message);
          }
        }));
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      nextCursor = result.next_cursor;
      
    } while (nextCursor);
    
    console.log(`🎉 Migration completed! Total migrated: ${totalMigrated} resources`);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
  }
}

// Run migration
migrateToCloudflareR2();
