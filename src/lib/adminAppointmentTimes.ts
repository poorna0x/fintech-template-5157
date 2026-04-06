/** Half-hour visit times (24h HH:mm) for admin scheduling — clearer than a bare native time input. */

function format12hLabel(hours24: number, minutes: number): string {
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const h12 = hours24 % 12 || 12;
  const mm = minutes.toString().padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

function buildHalfHourOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30] as const) {
      if (h === 21 && m === 30) break;
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      out.push({ value: `${hh}:${mm}`, label: format12hLabel(h, m) });
    }
  }
  return out;
}

export const APPOINTMENT_HALF_HOUR_OPTIONS = buildHalfHourOptions();

export const APPOINTMENT_PRESET_VALUES = new Set(
  APPOINTMENT_HALF_HOUR_OPTIONS.map((o) => o.value)
);

export const OTHER_TIME_SELECT_VALUE = 'other-time';

export function isPresetAppointmentTime(hhmm: string | null | undefined): boolean {
  return Boolean(hhmm && APPOINTMENT_PRESET_VALUES.has(hhmm));
}
