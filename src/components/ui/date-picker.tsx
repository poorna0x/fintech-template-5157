import * as React from "react";
import dayjs, { type Dayjs } from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  /** Value as YYYY-MM-DD string or undefined */
  value?: string;
  /** Called with YYYY-MM-DD string or undefined */
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function toDayjs(value: string | undefined): Dayjs | null {
  if (!value) return null;
  const d = dayjs(value, "YYYY-MM-DD", true);
  return d.isValid() ? d : null;
}

function formatDisplayDate(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const dayjsValue = toDayjs(value);
  const displayText = formatDisplayDate(value) || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("min-w-[120px] justify-start font-normal h-10 px-3 py-2 border border-input rounded-md", !value && "text-muted-foreground", className)}
          aria-label={placeholder}
        >
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <StaticDatePicker
            value={dayjsValue}
            onChange={(d) => {
              if (d) {
                onChange?.(dayjs(d).format("YYYY-MM-DD"));
                setOpen(false);
              }
            }}
            slotProps={{
              actionBar: { actions: [] },
            }}
          />
        </LocalizationProvider>
      </PopoverContent>
    </Popover>
  );
}
