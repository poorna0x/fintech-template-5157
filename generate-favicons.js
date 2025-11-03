#!/usr/bin/env node

/**
 * Generate favicon PNG files from SVG
 * 
 * This script generates all required PNG favicon sizes from favicon.svg
 * 
 * Requirements:
 * - sharp: npm install sharp
 * 
 * Usage: node generate-favicons.js
 */

const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];

async function generateFavicons() {
  try {
    // Try to use sharp if available
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.log('⚠️  sharp not found. Installing...');
      console.log('Please run: npm install sharp');
      console.log('\nAlternatively, you can:');
      console.log('1. Use an online tool like https://realfavicongenerator.net/');
      console.log('2. Use ImageMagick: convert -background none -resize SIZExSIZE public/favicon.svg public/OUTPUT.png');
      console.log('3. Export manually from a graphics editor');
      return;
    }

    const svgPath = path.join(__dirname, 'public', 'favicon.svg');
    const publicDir = path.join(__dirname, 'public');

    if (!fs.existsSync(svgPath)) {
      console.error('❌ favicon.svg not found in public directory');
      return;
    }

    console.log('📦 Generating favicon PNG files...\n');

    for (const { size, name } of sizes) {
      const outputPath = path.join(publicDir, name);
      
      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated ${name} (${size}x${size})`);
    }

    console.log('\n🎉 All favicons generated successfully!');
    console.log('💡 Note: The SVG favicon already supports light/dark themes automatically.');
    
  } catch (error) {
    console.error('❌ Error generating favicons:', error.message);
    console.log('\n💡 Manual alternatives:');
    console.log('1. Use https://realfavicongenerator.net/');
    console.log('2. Use ImageMagick: convert -background none -resize SIZExSIZE public/favicon.svg public/OUTPUT.png');
    console.log('3. Export from a graphics editor at the required sizes');
  }
}

generateFavicons();

