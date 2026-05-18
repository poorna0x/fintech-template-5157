/** Rollup manualChunks — keeps vendor splits and isolates admin DB layer from public index. */
export function manualChunks(id: string): string | undefined {
  if (id.includes('/src/lib/supabase.ts')) {
    return 'admin-data';
  }

  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (id.includes('react-router')) {
    return 'router-vendor';
  }

  if (id.includes('@mui/') || id.includes('@emotion/') || id.includes('dayjs')) {
    return 'mui-vendor';
  }

  if (id.includes('@supabase/') || id.includes('supabase-js')) {
    return 'supabase-vendor';
  }

  if (id.includes('recharts')) {
    return 'charts-vendor';
  }

  // Radix and other React UI libs must share the same chunk as react/react-dom.
  if (
    id.includes('react-dom') ||
    id.includes('/react/') ||
    id.includes('scheduler') ||
    id.includes('@radix-ui') ||
    id.includes('@floating-ui') ||
    id.includes('react-remove-scroll') ||
    id.includes('aria-hidden') ||
    id.includes('vaul') ||
    id.includes('cmdk') ||
    id.includes('sonner') ||
    id.includes('react-day-picker') ||
    id.includes('embla-carousel-react') ||
    id.includes('next-themes') ||
    id.includes('@tanstack/react-query') ||
    id.includes('react-i18next') ||
    id.includes('cloudinary-react') ||
    id.includes('input-otp') ||
    id.includes('lucide-react')
  ) {
    return 'react-vendor';
  }

  if (
    id.includes('react-hook-form') ||
    id.includes('@hookform/') ||
    id.includes('zod')
  ) {
    return 'form-vendor';
  }

  // Pure utilities only — must not import React (avoids circular chunk with react-vendor).
  if (
    id.includes('date-fns') ||
    id.includes('clsx') ||
    id.includes('tailwind-merge') ||
    id.includes('class-variance-authority') ||
    id.includes('i18next')
  ) {
    return 'utils-vendor';
  }

  return undefined;
}
