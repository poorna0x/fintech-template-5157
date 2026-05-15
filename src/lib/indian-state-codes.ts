/** Indian GST state / UT codes (Place of Supply). */
export const INDIAN_GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
] as const;

const CODE_TO_NAME = new Map(INDIAN_GST_STATES.map((s) => [s.code, s.name]));

const normalizeStateName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

const NAME_TO_CODE = new Map<string, string>(
  INDIAN_GST_STATES.map((s) => [normalizeStateName(s.name), s.code])
);

/** Aliases for common spellings / abbreviations. */
const NAME_ALIASES: Record<string, string> = {
  jammu: '01',
  jk: '01',
  'jammu & kashmir': '01',
  'jammu and kashmir': '01',
  hp: '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  uttaranchal: '05',
  haryana: '06',
  delhi: '07',
  'new delhi': '07',
  rajasthan: '08',
  raj: '08',
  'uttar pradesh': '09',
  up: '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  wb: '19',
  jharkhand: '20',
  odisha: '21',
  orissa: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  mp: '23',
  gujarat: '24',
  guj: '24',
  'dadra and nagar haveli': '26',
  daman: '26',
  diu: '26',
  maharashtra: '27',
  mh: '27',
  karnataka: '29',
  ka: '29',
  bangalore: '29',
  bengaluru: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  kl: '32',
  'tamil nadu': '33',
  tn: '33',
  puducherry: '34',
  pondicherry: '34',
  'andaman and nicobar': '35',
  telangana: '36',
  ts: '36',
  'andhra pradesh': '37',
  ap: '37',
  ladakh: '38',
};

export function normalizeGstStateCode(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 1 ? digits : digits.slice(0, 2);
}

export function getStateNameByCode(code: string): string | null {
  const normalized = normalizeGstStateCode(code);
  if (normalized.length !== 2) return null;
  const padded = normalized.padStart(2, '0');
  return CODE_TO_NAME.get(padded) ?? null;
}

export function getStateCodeByName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const normalized = normalizeStateName(trimmed);
  const direct = NAME_TO_CODE.get(normalized);
  if (direct) return direct;
  const alias = NAME_ALIASES[normalized];
  if (alias) return alias;
  for (const { code, name: stateName } of INDIAN_GST_STATES) {
    if (normalizeStateName(stateName).includes(normalized) || normalized.includes(normalizeStateName(stateName))) {
      return code;
    }
  }
  return null;
}

/** Karnataka — registered place of business for this company. */
export const DEFAULT_COMPANY_STATE_CODE = '29';

/** First two digits of a 15-character GSTIN = state code. */
export function getStateCodeFromGstin(gstin: string): string | null {
  const cleaned = gstin.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 2 || !/^\d{2}/.test(cleaned)) return null;
  const code = cleaned.slice(0, 2);
  return getStateNameByCode(code) ? code : null;
}

export function getCompanyStateCode(company: { state?: string; gstNumber?: string }): string {
  return (
    getStateCodeFromGstin(company.gstNumber || '') ||
    getStateCodeByName(company.state || '') ||
    DEFAULT_COMPANY_STATE_CODE
  );
}

export function resolvePlaceOfSupply(options: {
  customerState?: string;
  customerGstin?: string;
  defaultStateCode?: string;
}): { name: string; code: string } {
  const fallbackCode = options.defaultStateCode ?? DEFAULT_COMPANY_STATE_CODE;
  const fromGstin = options.customerGstin ? getStateCodeFromGstin(options.customerGstin) : null;
  if (fromGstin) {
    return { code: fromGstin, name: getStateNameByCode(fromGstin) || '' };
  }
  if (options.customerState?.trim()) {
    const fromState = getStateCodeByName(options.customerState);
    if (fromState) {
      return {
        code: fromState,
        name: getStateNameByCode(fromState) || options.customerState.trim(),
      };
    }
    return { code: '', name: options.customerState.trim() };
  }
  return {
    code: fallbackCode,
    name: getStateNameByCode(fallbackCode) || 'Karnataka',
  };
}

/** CGST+SGST when supplier and place of supply share the same GST state code. */
export function isIntraStateSupply(
  supplierStateCode: string,
  placeOfSupplyCode: string,
  supplierStateName?: string,
  placeOfSupplyStateName?: string
): boolean {
  const supplier = normalizeGstStateCode(supplierStateCode);
  const supply = normalizeGstStateCode(placeOfSupplyCode);
  if (supplier.length === 2 && supply.length === 2) {
    return supplier.padStart(2, '0') === supply.padStart(2, '0');
  }
  const resolvedSupplier =
    supplier.length === 2
      ? supplier.padStart(2, '0')
      : supplierStateName
        ? getStateCodeByName(supplierStateName)
        : null;
  const resolvedSupply =
    supply.length === 2
      ? supply.padStart(2, '0')
      : placeOfSupplyStateName
        ? getStateCodeByName(placeOfSupplyStateName)
        : null;
  if (resolvedSupplier && resolvedSupply) {
    return resolvedSupplier === resolvedSupply;
  }
  if (supplierStateName && placeOfSupplyStateName) {
    return normalizeStateName(supplierStateName) === normalizeStateName(placeOfSupplyStateName);
  }
  return false;
}

/** Normalize place of supply before persisting to the database. */
export function preparePlaceOfSupplyForSave(options: {
  placeName: string;
  placeCode: string;
  supplierStateCode: string;
  supplierStateName?: string;
}): {
  name: string;
  code: string;
  isIntraState: boolean;
  isValid: boolean;
} {
  let code = normalizeGstStateCode(options.placeCode);
  let name = options.placeName.trim();

  if (code.length === 2) {
    code = code.padStart(2, '0');
    const fromCode = getStateNameByCode(code);
    if (fromCode) name = fromCode;
  } else if (name) {
    const fromName = getStateCodeByName(name);
    if (fromName) {
      code = fromName;
      const canonical = getStateNameByCode(fromName);
      if (canonical) name = canonical;
    }
  }

  const isValid = code.length === 2 && getStateNameByCode(code) !== null;
  const isIntraState =
    isValid &&
    isIntraStateSupply(options.supplierStateCode, code, options.supplierStateName, name);

  return { name, code, isIntraState, isValid };
}
