/** Rollup manualChunks — keeps vendor splits and isolates admin DB layer from public index. */
export function manualChunks(id: string): string | undefined {
  if (id.includes('node_modules')) {
    if (id.includes('react-router')) return 'router-vendor';
    if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
    if (
      id.includes('@mui/') ||
      id.includes('@emotion/') ||
      id.includes('dayjs')
    ) {
      return 'mui-vendor';
    }
    if (id.includes('@radix-ui/')) return 'ui-vendor';
    if (
      id.includes('react-hook-form') ||
      id.includes('@hookform/') ||
      id.includes('zod') ||
      id.includes('input-otp')
    ) {
      return 'form-vendor';
    }
    if (
      id.includes('@supabase/') ||
      id.includes('supabase-js')
    ) {
      return 'supabase-vendor';
    }
    if (id.includes('recharts')) return 'charts-vendor';
    if (
      id.includes('lucide-react') ||
      id.includes('date-fns') ||
      id.includes('clsx') ||
      id.includes('tailwind-merge') ||
      id.includes('class-variance-authority') ||
      id.includes('sonner') ||
      id.includes('cmdk') ||
      id.includes('vaul') ||
      id.includes('embla-carousel') ||
      id.includes('react-resizable-panels') ||
      id.includes('next-themes') ||
      id.includes('i18next') ||
      id.includes('react-i18next') ||
      id.includes('react-day-picker') ||
      id.includes('cloudinary-react') ||
      id.includes('@tanstack/react-query')
    ) {
      return 'utils-vendor';
    }
  }

  // Full db layer + table/RPC strings — only loaded with admin/technician/booking routes
  if (id.includes('/src/lib/supabase.ts')) {
    return 'admin-data';
  }

  return undefined;
}
