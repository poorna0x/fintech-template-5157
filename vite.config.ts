import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { securityCspPlugin } from "./scripts/vite-plugin-security-csp.mjs";
import { asyncCssPlugin } from "./scripts/vite-plugin-async-css.mjs";
import { manualChunks } from "./vite.config.chunks";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Allow access from all network interfaces (including mobile devices)
    port: 8080,
    strictPort: false, // If 8080 is taken, try next available port
    // Using HTTP for local development - HTTPS causes SSL certificate issues with IP addresses
    // For production, HTTPS is handled by the hosting provider (Netlify)
    https: false, // Disabled for local network access compatibility
    hmr: {
      // Allow HMR over local network
      clientPort: 8080,
    },
    proxy: {
      // WhatsApp Cloud API POC — local functions (reads WHATSAPP_* from .env.local).
      '/.netlify/functions/whatsapp-send': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-webhook': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-events': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-templates': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-r2-signed-url': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-purge-messages': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-booking-start': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-tray-clear-push': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-inbox-apply-to-customer': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/whatsapp-ai-chat-settings': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/geocode': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/resolve-maps-link': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/pdf-authenticity-otp-verify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/pdf-authenticity-check': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/document-accept-send': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/document-accept-email-send': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/document-accept-public': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/tech-office-status-mint': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/tech-office-status': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/notify-admins': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/job-review-notify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/job-review-invite': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/job-review-public': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/db-storage-stats': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/cloudinary-usage': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/ilovepdf-usage': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // AI assistant is local-only until it ships to production.
      '/.netlify/functions/ai-inbox-suggest': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/ai-crm-chat': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/ai-document-draft': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/ai-usage': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/ai-config-save': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/cloudinary-delete': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // Booking create must hit local functions so DPDP consent writes run before main deploy.
      '/.netlify/functions/booking-job-create': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/booking-customer-mutate': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/booking-customer-lookup': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/booking-intent': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // ALTCHA challenge + login must share the same HMAC. If login stays on the
      // production catch-all, admin/technician get "Invalid login token signature".
      '/.netlify/functions/altcha-verify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/secure-auth-login': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/sync-portal-session': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/clear-portal-session': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // DPDP privacy intake / export — local until this branch is deployed.
      '/.netlify/functions/privacy-request': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/privacy-data-export': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/privacy-customer-anonymize': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // Local Puppeteer — must not hit production (cannot load localhost/ngrok assets).
      '/.netlify/functions/generate-pdf': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions/tech-field-day': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // Proxy remaining Netlify functions to production (legacy default for undeclared routes).
      '/.netlify/functions': {
        // Use production functions so nudges like goingNow work without netlify:dev.
        target: 'https://hydrogenro.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path, // Keep the path as-is
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Production functions reject Origin: http://localhost:8080 (CORS
            // allowlist) — present the target origin so dev logins work.
            proxyReq.setHeader('origin', 'https://hydrogenro.com');
            console.log('Proxying request to:', proxyReq.path);
          });
        },
      },
    },
  },
  plugins: [
    react(),
    securityCspPlugin(mode),
    asyncCssPlugin(mode),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    // Optimize bundle size
    target: 'esnext',
    minify: 'terser',
    cssCodeSplit: true,
    cssMinify: true,
    terserOptions: {
      compress: {
        // Remove console logs in production for better performance
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug'] : [],
      },
    },
    // Code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks,
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 600,
    // Report compressed size to reduce build output
    reportCompressedSize: true,
    // Increase build speed
    sourcemap: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
}));
