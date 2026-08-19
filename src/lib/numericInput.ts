/**
 * Keep number fields from turning a cleared value into a leftover 0
 * (so typing 12 does not become 012).
 */

export function stripLeadingZerosFromNumericInput(raw: string): string {
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return raw;
  const negative = raw.startsWith('-');
  let rest = negative ? raw.slice(1) : raw;
  if (rest === '') return raw;
  if (/^0+$/.test(rest)) return `${negative ? '-' : ''}0`;
  rest = rest.replace(/^0+(?=\d)/, '');
  rest = rest.replace(/^0{2,}(\.)/, '0$1');
  return `${negative ? '-' : ''}${rest}`;
}

export function isNumericZeroValue(value: unknown): boolean {
  return value === 0 || value === '0';
}
