import type { CapacitorConfig } from '@capacitor/cli';

/**
 * HydrogenRO technician Android wrapper.
 *
 * The app loads the live site (server.url) instead of bundled assets, so web
 * deploys reach the app instantly without rebuilding the APK. Native plugins
 * (background geolocation) are still injected into the remote page by the
 * Capacitor bridge.
 */
const config: CapacitorConfig = {
  appId: 'com.hydrogenro.technician',
  appName: 'HydrogenRO Tech',
  webDir: 'dist',
  backgroundColor: '#FAFAFA',
  server: {
    url: 'https://hydrogenro.com/technician',
    androidScheme: 'https',
    cleartext: false,
    // Keep allowNavigation minimal — hosting Turnstile challenge hosts here
    // can break Capacitor bridge injection after top-level navigations.
    // Turnstile loads in an iframe; cookies+DOM Storage (MainActivity) are enough.
    allowNavigation: ['hydrogenro.com', '*.hydrogenro.com'],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FAFAFA',
  },
};

export default config;
