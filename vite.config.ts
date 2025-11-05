import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Allow access from all network interfaces (including mobile devices)
    port: 8084,
    strictPort: false, // If 8084 is taken, try next available port
    hmr: {
      // Allow HMR over local network
      clientPort: 8084,
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-switch',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-slot',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-slider',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-menubar',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-aspect-ratio',
          ],
          'form-vendor': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
            'input-otp',
          ],
          'supabase-vendor': [
            '@supabase/supabase-js',
            '@supabase/auth-helpers-react',
            '@supabase/ssr',
          ],
          'utils-vendor': [
            'clsx',
            'tailwind-merge',
            'class-variance-authority',
            'date-fns',
            'lucide-react',
            'sonner',
            'cmdk',
            'vaul',
            'embla-carousel-react',
            'react-resizable-panels',
            'recharts',
            'next-themes',
            'i18next',
            'i18next-browser-languagedetector',
            'react-i18next',
            'react-day-picker',
            'cloudinary-react',
            '@tanstack/react-query',
          ],
        },
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
