import type { CapacitorConfig } from '@capacitor/cli';

/**
 * HydrogenRO technician Android wrapper.
 *
 * The WebView stays on the live site (server.url) so login, Turnstile, and
 * /.netlify/functions keep working. Cold start does not wait on that download:
 * AppShellCache serves HTML/JS/CSS from disk, then refreshes the shell in the
 * background for the next open. Native plugins are still injected by the bridge.
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
