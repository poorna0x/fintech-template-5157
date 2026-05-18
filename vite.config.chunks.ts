/** Rollup manualChunks — only split admin DB layer; keep React + UI in one chunk to avoid circular deps. */
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

  if (id.includes('@supabase/') || id.includes('supabase-js')) {
    return 'supabase-vendor';
  }

  if (id.includes('recharts')) {
    return 'charts-vendor';
  }

  // Single React chunk: react, radix, mui, forms, and all React-dependent UI libs.
  if (
    id.includes('react-dom') ||
    id.includes('/react/') ||
    id.includes('scheduler') ||
    id.includes('@radix-ui') ||
    id.includes('@floating-ui') ||
    id.includes('react-remove-scroll') ||
    id.includes('aria-hidden') ||
    id.includes('@mui/') ||
    id.includes('@emotion/') ||
    id.includes('dayjs') ||
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
    id.includes('lucide-react') ||
    id.includes('react-hook-form') ||
    id.includes('@hookform/') ||
    id.includes('zod')
  ) {
    return 'react-vendor';
  }

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
