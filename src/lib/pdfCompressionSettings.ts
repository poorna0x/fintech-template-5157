import { supabase } from '@/lib/supabase';

export const PDF_COMPRESSION_KEY = 'pdf_ilovepdf_compress';

export async function fetchPdfCompressionEnabled(): Promise<{
  enabled: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', PDF_COMPRESSION_KEY)
    .maybeSingle();

  if (error) return { enabled: true, error: error.message };
  return { enabled: data?.value !== false, error: null };
}

export async function savePdfCompressionEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: PDF_COMPRESSION_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  return { ok: !error, error: error?.message || null };
}
