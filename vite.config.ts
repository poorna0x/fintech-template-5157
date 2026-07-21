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
      // Proxy Netlify functions to avoid CORS issues
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
