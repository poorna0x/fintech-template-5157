import * as React from "react";
import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, pickersDayClasses } from "@mui/x-date-pickers/PickersDay";
import type { PickersDayProps } from "@mui/x-date-pickers/PickersDay";

export interface DatePickerCalendarProps {
  /** Value as YYYY-MM-DD string or undefined */
  value?: string;
  /** Called with the selected date as a YYYY-MM-DD string */
  onSelect: (value: string) => void;
  /** YYYY-MM-DD days that cannot be chosen */
  disabledDates?: readonly string[];
  /** Called when a disabled day is tapped, so the calendar can explain why. */
  onBlockedDate?: (value: string) => void;
  /** Earliest YYYY-MM-DD that can be chosen */
  minDate?: string;
}

/**
 * Compact month calendar for <DatePicker> — Google / Material DateCalendar.
 *
 * Uses DateCalendar (month + day grid only) instead of StaticDatePicker so the
 * popover stays short enough to fit on screen.
 *
 * Lazy-loaded by date-picker.tsx (with prefetch) so MUI + emotion + dayjs stay
 * out of the shared vendor chunk.
 */
export default function DatePickerCalendar({
  value,
  onSelect,
  disabledDates,
  onBlockedDate,
  minDate,
}: DatePickerCalendarProps) {
  const parsed = value ? dayjs(value, "YYYY-MM-DD", true) : null;
  const dayjsValue = parsed && parsed.isValid() ? parsed : null;
  const blocked = React.useMemo(() => new Set(disabledDates || []), [disabledDates]);
  const blockedRef = React.useRef(blocked);
  blockedRef.current = blocked;
  const onBlockedRef = React.useRef(onBlockedDate);
  onBlockedRef.current = onBlockedDate;
  const min = minDate ? dayjs(minDate, "YYYY-MM-DD", true) : null;
  const minDay = min && min.isValid() ? min : undefined;

  const DaySlot = React.useCallback(function DaySlot(props: PickersDayProps) {
    const iso = dayjs(props.day).format("YYYY-MM-DD");
    if (!blockedRef.current.has(iso)) return <PickersDay {...props} />;
    return (
      <PickersDay
        {...props}
        disabled={false}
        selected={false}
        today={false}
        disableHighlightToday
        className={`${props.className ?? ""} ${pickersDayClasses.disabled}`}
        sx={{ color: "text.disabled" }}
        onDaySelect={() => {
          onBlockedRef.current?.(iso);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onBlockedRef.current?.(iso);
            return;
          }
          props.onKeyDown?.(event, props.day);
        }}
      />
    );
  }, []);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateCalendar
        value={dayjsValue}
        minDate={minDay}
        shouldDisableDate={(day) => blocked.has(dayjs(day).format("YYYY-MM-DD"))}
        slots={{ day: DaySlot }}
        onChange={(d) => {
          if (!d) return;
          const iso = dayjs(d).format("YYYY-MM-DD");
          if (blocked.has(iso)) {
            onBlockedDate?.(iso);
            return;
          }
          if (minDay && iso < minDay.format("YYYY-MM-DD")) return;
          onSelect(iso);
        }}
        sx={{
          width: 320,
          maxHeight: "min(22rem, calc(100dvh - 2rem))",
        }}
      />
    </LocalizationProvider>
  );
}
