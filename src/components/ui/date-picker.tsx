import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// The actual calendar pulls in MUI + emotion + dayjs. Load it lazily so that
// heavy dependency graph is only fetched when a date picker is opened, keeping
// it out of the shared vendor chunk that loads on every page.
const DatePickerCalendar = React.lazy(() => import("./date-picker-calendar"));

export interface DatePickerProps {
  /** Value as YYYY-MM-DD string or undefined */
  value?: string;
  /** Called with YYYY-MM-DD string or undefined */
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
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
  const displayText = formatDisplayDate(value) || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            // Match the shape of <Input>/<Select> so DatePicker fills its column
            // and lines up with neighboring fields. Callsites in flex rows can
            // opt out with `w-auto` (and add their own min-width) via className.
            "h-10 w-full justify-start font-normal px-3 py-2 text-sm",
            !value && "text-muted-foreground",
            className,
          )}
          aria-label={placeholder}
        >
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[110]" align="start">
        <React.Suspense
          fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        >
          <DatePickerCalendar
            value={value}
            onSelect={(d) => {
              onChange?.(d);
              setOpen(false);
            }}
          />
        </React.Suspense>
      </PopoverContent>
    </Popover>
  );
}
