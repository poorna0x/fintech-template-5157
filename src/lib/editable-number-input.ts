/** While typing, number fields may be temporarily empty instead of forcing 0. */
export type EditableNumber = number | '';

export function parseEditableNumberInput(raw: string): EditableNumber {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : '';
}

export function displayEditableNumber(value: EditableNumber): string | number {
  return value === '' ? '' : value;
}

/** Coerce editable field to a finite number for math, display totals, and save. */
export function num(value: EditableNumber | number | undefined | null): number {
  if (value === '' || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
