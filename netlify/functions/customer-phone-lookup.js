/**
 * Find a customer by 10-digit Indian mobile using digit-normalized match
 * (handles +91 / spaces / dashes in stored phone). Service-role only RPC.
 * Falls back to LIKE if the RPC is missing or rejects the number.
 */

async function findCustomerByPhoneDigits(db, phone10, columns = 'id,full_name') {
  const phone = String(phone10 || '').replace(/\D/g, '').slice(-10);
  if (phone.length < 10) return null;

  try {
    const { data, error } = await db.rpc('get_customer_by_phone_for_booking', {
      p_phone: phone,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        const out = { id: row.id };
        if (columns.includes('full_name')) out.full_name = row.full_name;
        return out;
      }
      return null;
    }
    console.warn('[customer-phone-lookup] rpc failed, using LIKE fallback:', error.message);
  } catch (err) {
    console.warn('[customer-phone-lookup] rpc threw, using LIKE fallback:', err?.message || err);
  }

  const { data: customer } = await db
    .from('customers')
    .select(columns)
    .or(`phone.like.%${phone},alternate_phone.like.%${phone}`)
    .limit(1)
    .maybeSingle();
  return customer || null;
}

module.exports = { findCustomerByPhoneDigits };
