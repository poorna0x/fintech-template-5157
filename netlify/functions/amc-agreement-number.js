/** Shared AMC agreement number helpers (mirrors src/lib/amc-agreement-number.ts). */

function parseAgreementNumberFromAdditionalInfo(additionalInfo) {
  if (additionalInfo == null) return null;
  try {
    const meta =
      typeof additionalInfo === 'string' ? JSON.parse(additionalInfo) : additionalInfo;
    const num = meta?.agreement_number;
    return typeof num === 'string' && num.trim() ? num.trim() : null;
  } catch {
    return null;
  }
}

function normalizeAgreementNumber(value) {
  return String(value || '').trim().toLowerCase();
}

async function findActiveAmcIdByAgreementNumber(admin, customerId, agreementNumber) {
  const target = normalizeAgreementNumber(agreementNumber);
  if (!target) return null;

  const { data, error } = await admin
    .from('amc_contracts')
    .select('id, additional_info, created_at')
    .eq('customer_id', customerId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  for (const row of data || []) {
    const num = parseAgreementNumberFromAdditionalInfo(row.additional_info);
    if (num && normalizeAgreementNumber(num) === target) {
      return row.id;
    }
  }

  return null;
}

module.exports = {
  parseAgreementNumberFromAdditionalInfo,
  normalizeAgreementNumber,
  findActiveAmcIdByAgreementNumber,
};
