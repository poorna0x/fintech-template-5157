/** Runtime Supabase config (Vite env vars are fixed at build time on Netlify). */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) return false;
  if (supabaseUrl.includes('placeholder.supabase.co')) return false;
  if (supabaseAnonKey === 'placeholder-key') return false;
  return true;
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null;
  return (
    'Supabase is not configured for this build. In Netlify → Site settings → Environment variables, ' +
    'set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (for Production), then trigger a new deploy.'
  );
}
