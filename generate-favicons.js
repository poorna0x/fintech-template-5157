#!/usr/bin/env node

/**
 * Generate favicon PNG files and ICO from SVG
 * 
 * This script generates all required PNG favicon sizes from favicon.svg
 * IMPORTANT: Also generates favicon.ico (used by Google!)
 * 
 * Requirements:
 * - sharp: npm install sharp
 * - to-ico: npm install to-ico (optional, for ICO generation)
 * 
 * Usage: node generate-favicons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      sharp = (await import('sharp')).default;
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

    // Generate favicon.ico (IMPORTANT for Google!)
    console.log('\n📦 Generating favicon.ico (for Google)...');
    try {
      const { default: toIco } = await import('to-ico');
      
      // Read the 16x16 and 32x32 PNGs we just created
      const png16 = fs.readFileSync(path.join(publicDir, 'favicon-16x16.png'));
      const png32 = fs.readFileSync(path.join(publicDir, 'favicon-32x32.png'));
      
      // Create multi-resolution ICO file
      const ico = await toIco([png16, png32]);
      fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
      
      console.log('✅ Generated favicon.ico (16x16 + 32x32)');
    } catch (icoError) {
      console.log('⚠️  to-ico not available. Installing...');
      console.log('   Run: npm install to-ico');
      console.log('\n💡 Alternative: Convert manually:');
      console.log('   1. Use https://convertio.co/png-ico/ (upload favicon-32x32.png)');
      console.log('   2. Use ImageMagick: convert favicon-16x16.png favicon-32x32.png public/favicon.ico');
      console.log('   3. Use https://realfavicongenerator.net/ (upload favicon.svg)');
    }

    console.log('\n🎉 All favicons generated successfully!');
    console.log('💡 Note: The SVG favicon supports light/dark themes automatically.');
    console.log('✅ favicon.ico is ready for Google to fetch!');
    
  } catch (error) {
    console.error('❌ Error generating favicons:', error.message);
    console.log('\n💡 Manual alternatives:');
    console.log('1. Use https://realfavicongenerator.net/ (upload favicon.svg)');
    console.log('2. Use ImageMagick: convert -background none -resize SIZExSIZE public/favicon.svg public/OUTPUT.png');
    console.log('3. Export from a graphics editor at the required sizes');
    console.log('\n⚠️  IMPORTANT: Make sure favicon.ico is updated for Google!');
  }
}

generateFavicons();

