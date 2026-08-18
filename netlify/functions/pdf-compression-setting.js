const { getServiceSupabase } = require('./whatsapp-helper');

const SETTING_KEY = 'pdf_ilovepdf_compress';

/**
 * Missing row defaults ON so deployments remain compatible while the migration
 * is being applied. DB/config errors fail closed to the original PDF.
 */
async function isPdfCompressionEnabled(db = getServiceSupabase()) {
  if (!db) {
    console.warn('[pdf-compress] settings DB unavailable; using original PDF');
    return false;
  }

  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[pdf-compress] setting lookup failed; using original PDF:', error.message);
    return false;
  }

  return data?.value !== false;
}

module.exports = {
  SETTING_KEY,
  isPdfCompressionEnabled,
};
