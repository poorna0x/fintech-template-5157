# How to Install PWA on iOS (iPhone/iPad)

## Method 1: Using Safari Browser (Recommended)

1. **Open Safari** (not Chrome or other browsers - Safari is required for PWA installation on iOS)

2. **Navigate to the Technician Dashboard**:
   - Go to: `https://hydrogenro.com/technician` (or your deployed URL)
   - Log in to your technician account

3. **Tap the Share Button**:
   - Look for the **Share** button at the bottom of Safari (square with arrow pointing up)
   - It's usually in the center-bottom of the screen

4. **Scroll Down and Tap "Add to Home Screen"**:
   - In the share menu, scroll down until you see **"Add to Home Screen"**
   - Tap on it

5. **Customize the Name (Optional)**:
   - You can change the name if you want (default will be "Hydrogen RO")
   - Tap **"Add"** in the top right corner

6. **Done!**:
   - The PWA will now appear on your home screen with an icon
   - Tap it to open the app in standalone mode (no browser UI)

## Method 2: Using Chrome on iOS (Limited)

**Note**: Chrome on iOS uses Safari's engine, so PWAs work but installation is done through Safari's share menu.

1. Open the site in Chrome
2. Tap the menu (three dots)
3. Select "Open in Safari"
4. Follow Method 1 steps 3-6

## Troubleshooting

### "Add to Home Screen" option not showing?
- Make sure you're using **Safari** (not Chrome or other browsers)
- The site must be accessed via **HTTPS** (secure connection)
- Try refreshing the page first
- Make sure you're logged in and on the `/technician` page

### App opens in browser instead of standalone?
- Delete the app from home screen
- Reinstall following the steps above
- Make sure you're using Safari when installing

### App icon looks wrong?
- The app uses the favicon/logo as the icon
- iOS may cache the old icon - try reinstalling

## Features Available in PWA Mode

✅ Works offline (cached pages)
✅ No browser address bar (standalone mode)
✅ Can receive push notifications
✅ Faster loading (cached resources)
✅ App-like experience

## Important Notes

- **Safari Only**: PWAs can only be installed via Safari on iOS
- **HTTPS Required**: The site must use HTTPS (not HTTP)
- **iOS 11.3+**: Requires iOS 11.3 or later
- **Home Screen**: The app will appear on your home screen like a native app

