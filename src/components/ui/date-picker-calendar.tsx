import * as React from "react";
import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";

export interface DatePickerCalendarProps {
  /** Value as YYYY-MM-DD string or undefined */
  value?: string;
  /** Called with the selected date as a YYYY-MM-DD string */
  onSelect: (value: string) => void;
}

/**
 * Compact month calendar for <DatePicker>.
 *
 * Uses DateCalendar (month + day grid only) instead of StaticDatePicker so the
 * popover stays short enough to fit on screen. The full static picker also
 * shows a "SELECT DATE" toolbar that pushed the grid below the viewport when
 * the page had nothing to scroll.
 *
 * Lazy-loaded by date-picker.tsx so MUI + emotion + dayjs stay out of the
 * shared vendor chunk.
 */
export default function DatePickerCalendar({ value, onSelect }: DatePickerCalendarProps) {
  const parsed = value ? dayjs(value, "YYYY-MM-DD", true) : null;
  const dayjsValue = parsed && parsed.isValid() ? parsed : null;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateCalendar
        value={dayjsValue}
        onChange={(d) => {
          if (d) {
            onSelect(dayjs(d).format("YYYY-MM-DD"));
          }
        }}
        sx={{
          width: 320,
          maxHeight: "min(22rem, calc(100dvh - 2rem))",
        }}
      />
    </LocalizationProvider>
  );
}
