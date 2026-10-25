const KEY = 'night_routine';

const DEFAULTS = { admin: true, technician: true, business: true };

/**
 * Night scheduled messages. Missing row stays on so existing 9–10 PM jobs keep running.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
async function loadNightRoutine(db) {
  try {
    const { data, error } = await db
      .from('crm_settings')
      .select('value')
      .eq('key', KEY)
      .maybeSingle();
    if (error || !data?.value || typeof data.value !== 'object') return { ...DEFAULTS };
    const value = data.value;
    return {
      admin: value.admin !== false,
      technician: value.technician !== false,
      business: value.business !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** technicians.push_prefs.night_routine — missing means this technician still gets night messages. */
function techNightRoutineOn(pushPrefs) {
  if (!pushPrefs || typeof pushPrefs !== 'object') return true;
  return pushPrefs.night_routine !== false;
}

module.exports = { loadNightRoutine, techNightRoutineOn };
