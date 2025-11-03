# Favicon Setup Guide

The favicon system is now fully responsive and supports:
- ✅ Light/Dark theme (automatic via CSS media queries)
- ✅ Mobile devices (iOS, Android)
- ✅ PWA (Progressive Web App)
- ✅ All browsers (with fallbacks)

## Current Setup

### SVG Favicon (Primary)
- **File**: `public/favicon.svg`
- **Features**: Automatically adapts to light/dark theme using `prefers-color-scheme`
- **Dark mode**: Black background with white water drop
- **Light mode**: White background with black water drop

### Required PNG Icons

The following PNG icons need to be generated for full compatibility:

1. `favicon-16x16.png` - Standard browser favicon
2. `favicon-32x32.png` - Standard browser favicon
3. `apple-touch-icon.png` (180x180) - iOS devices
4. `android-chrome-192x192.png` - Android Chrome
5. `android-chrome-512x512.png` - Android Chrome & PWA

## Generating PNG Icons

### Option 1: Automated Script (Recommended)

```bash
# Install sharp (if not already installed)
npm install sharp

# Generate all icons
node generate-favicons.js
```

### Option 2: Online Tool

1. Go to https://realfavicongenerator.net/
2. Upload `public/favicon.svg`
3. Configure settings:
   - iOS: 180x180
   - Android Chrome: 192x192, 512x512
   - General: 16x16, 32x32
4. Download and extract to `public/` folder

### Option 3: ImageMagick

```bash
# Generate each size
convert -background none -resize 16x16 public/favicon.svg public/favicon-16x16.png
convert -background none -resize 32x32 public/favicon.svg public/favicon-32x32.png
convert -background none -resize 180x180 public/favicon.svg public/apple-touch-icon.png
convert -background none -resize 192x192 public/favicon.svg public/android-chrome-192x192.png
convert -background none -resize 512x512 public/favicon.svg public/android-chrome-512x512.png
```

### Option 4: Graphics Editor

Export `favicon.svg` at each required size:
- Use Adobe Illustrator, Inkscape, or Figma
- Export as PNG at exact sizes listed above

## Testing

1. **Desktop browsers**: Check favicon in tab
2. **Mobile**: 
   - iOS: Add to home screen, check icon
   - Android: Add to home screen, check icon
3. **PWA**: 
   - Install as PWA
   - Check icon in app launcher
4. **Theme switching**:
   - Change system theme (light/dark)
   - Favicon should automatically update

## Files Structure

```
public/
├── favicon.svg              # Primary SVG (responsive to theme)
├── favicon.ico             # Fallback for older browsers
├── favicon-16x16.png      # Standard favicon
├── favicon-32x32.png      # Standard favicon
├── apple-touch-icon.png   # iOS (180x180)
├── android-chrome-192x192.png  # Android & PWA
└── android-chrome-512x512.png  # Android & PWA
```

## Notes

- The SVG favicon will work immediately in modern browsers with theme support
- PNG icons provide better compatibility with older browsers and specific platforms
- PWA installation requires the PNG icons in the manifest
- All icons are configured in `index.html` and `site.webmanifest`

