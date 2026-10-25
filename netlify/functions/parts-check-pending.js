// One row in crm_settings: admin tapped No on tonight's parts check.
// Morning cron asks once, then deletes the row. A morning No is not saved.

const KEY = 'admin_parts_check_pending';

function parsePending(value) {
  if (!value || typeof value !== 'object') return null;
  const workDate = String(value.workDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  return { workDate };
}

async function readPartsCheckPending(db) {
  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parsePending(data?.value);
}

/** Queue the single next-morning ask for this IST work day. */
async function savePartsCheckEveningNo(db, workDate) {
  const { error } = await db.from('crm_settings').upsert(
    {
      key: KEY,
      value: { workDate },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
}

async function clearPartsCheckPending(db) {
  const { error } = await db.from('crm_settings').delete().eq('key', KEY);
  if (error) throw new Error(error.message);
}

module.exports = {
  readPartsCheckPending,
  savePartsCheckEveningNo,
  clearPartsCheckPending,
};
