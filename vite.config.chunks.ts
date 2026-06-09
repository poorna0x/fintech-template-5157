/** Rollup manualChunks — only split admin DB layer; keep React + UI in one chunk to avoid circular deps. */
export function manualChunks(id: string): string | undefined {
  // ──────────────────────────────────────────────────────────────────
  // SECURITY: keep shared "shell" utilities (cn, chromeStorage, pwa
  // helpers, supabase auth client, etc.) OUT of the admin-data chunk.
  //
  // Why this exists: src/lib/supabase.ts is the admin/technician data
  // layer (contains every RPC name + table name). The eager app shell
  // also needs the lightweight utilities below. When Rollup sees a
  // module used by both the entry AND admin-data, it merges that
  // module into admin-data — which forces the entry chunk to statically
  // import from admin-data, which forces Vite to put `admin-data` in
  // the public <link rel=modulepreload> list. That's how anonymous
  // visitors end up downloading the file documented in the
  // "Sensitive Business Logic Exposed" finding.
  //
  // Routing these files into a dedicated `shell-utils` chunk breaks
  // that merge: the entry imports from shell-utils, admin-data also
  // imports from shell-utils, and admin-data is no longer in the
  // entry's static dep graph.
  // ──────────────────────────────────────────────────────────────────
  if (
    id.includes('/src/lib/utils.ts') ||
    id.includes('/src/lib/storage.ts') ||
    id.includes('/src/lib/storage/') ||
    id.includes('/src/lib/pwa.ts') ||
    id.includes('/src/lib/supabaseClient.ts') ||
    id.includes('/src/lib/supabaseConfig.ts') ||
    id.includes('/src/lib/sanitizePostgrestError.ts') ||
    // Vite's `__vitePreload` runtime helper is a virtual module shared
    // between the entry (for lazy page imports) and supabase.ts (for
    // its many `await import(...)` calls). Without this pin, Rollup
    // tends to bundle it into `admin-data`, which puts that chunk
    // back into the entry's static dep graph (and into modulepreload).
    id.includes('vite/preload-helper')
  ) {
    return 'shell-utils';
  }

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

  // NOTE: @mui/*, @emotion/*, and dayjs are deliberately NOT given a manual
  // chunk. They are reachable only through the lazy-loaded date-picker calendar
  // (src/components/ui/date-picker.tsx -> date-picker-calendar.tsx). Letting
  // Rollup auto-split them keeps any helper modules shared with react-vendor in
  // react-vendor, so the on-demand MUI chunk depends on react-vendor instead of
  // being pulled into the entry's static graph (and modulepreload).

  // Single React chunk: react, radix, forms, and all React-dependent UI libs.
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
