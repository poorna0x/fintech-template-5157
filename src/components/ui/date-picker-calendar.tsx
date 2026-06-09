import * as React from "react";
import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";

export interface DatePickerCalendarProps {
  /** Value as YYYY-MM-DD string or undefined */
  value?: string;
  /** Called with the selected date as a YYYY-MM-DD string */
  onSelect: (value: string) => void;
}

/**
 * MUI-backed calendar UI for <DatePicker>.
 *
 * This is intentionally split into its own module and lazy-loaded by
 * date-picker.tsx so that the heavy MUI + emotion + dayjs dependency graph is
 * fetched only when a user actually opens a date picker — instead of shipping
 * it in the shared vendor chunk that loads on every page.
 */
export default function DatePickerCalendar({ value, onSelect }: DatePickerCalendarProps) {
  const parsed = value ? dayjs(value, "YYYY-MM-DD", true) : null;
  const dayjsValue = parsed && parsed.isValid() ? parsed : null;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <StaticDatePicker
        value={dayjsValue}
        onChange={(d) => {
          if (d) {
            onSelect(dayjs(d).format("YYYY-MM-DD"));
          }
        }}
        slotProps={{
          actionBar: { actions: [] },
        }}
      />
    </LocalizationProvider>
  );
}
