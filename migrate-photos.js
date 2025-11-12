// Migration script to move photos from 'images' field to 'before_photos' field
// Run this script to fix existing job records

import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase credentials
// Set these in your environment or .env.local file:
// SUPABASE_URL=your_supabase_url
// SUPABASE_ANON_KEY=your_supabase_anon_key
const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migratePhotos() {
  try {
    console.log('Starting photo migration...');
    
    // Get all jobs that have photos in the 'images' field
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, images, before_photos')
      .not('images', 'is', null);
    
    if (fetchError) {
      throw new Error(`Error fetching jobs: ${fetchError.message}`);
    }
    
    console.log(`Found ${jobs.length} jobs with images field`);
    
    for (const job of jobs) {
      // Only migrate if images exist and before_photos is empty
      if (job.images && Array.isArray(job.images) && job.images.length > 0 && 
          (!job.before_photos || job.before_photos.length === 0)) {
        
        console.log(`Migrating photos for job ${job.id}...`);
        
        const { error: updateError } = await supabase
          .from('jobs')
          .update({ 
            before_photos: job.images,
            images: null // Clear the old images field
          })
          .eq('id', job.id);
        
        if (updateError) {
          console.error(`Error updating job ${job.id}:`, updateError);
        } else {
          console.log(`Successfully migrated photos for job ${job.id}`);
        }
      }
    }
    
    console.log('Photo migration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run migration if this script is executed directly
migratePhotos();

export { migratePhotos };
