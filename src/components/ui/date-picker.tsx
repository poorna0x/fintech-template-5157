import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Google / Material DateCalendar — lazy so MUI stays out of the main vendor chunk.
// Prefetch on mount / hover so the first open is usually instant (no "Loading…" flash).
const loadDatePickerCalendar = () => import("./date-picker-calendar");
const DatePickerCalendar = React.lazy(loadDatePickerCalendar);

/** Compact DateCalendar height; used to pick top vs bottom before open. */
const CALENDAR_ESTIMATED_HEIGHT = 360;

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

function pickPopoverSide(trigger: HTMLElement): "top" | "bottom" {
  const rect = trigger.getBoundingClientRect();
  const gap = 12;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  return spaceBelow < CALENDAR_ESTIMATED_HEIGHT && spaceAbove > spaceBelow ? "top" : "bottom";
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [side, setSide] = React.useState<"top" | "bottom">("bottom");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const displayText = formatDisplayDate(value) || placeholder;

  React.useEffect(() => {
    let cancelled = false;
    const prefetch = () => {
      if (!cancelled) void loadDatePickerCalendar();
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(prefetch);
    } else {
      timeoutId = setTimeout(prefetch, 400);
    }
    return () => {
      cancelled = true;
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      void loadDatePickerCalendar();
      if (triggerRef.current) setSide(pickPopoverSide(triggerRef.current));
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
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
          onPointerEnter={() => {
            void loadDatePickerCalendar();
          }}
          onFocus={() => {
            void loadDatePickerCalendar();
          }}
        >
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-0 z-[110]"
        align="start"
        side={side}
        sideOffset={6}
        collisionPadding={12}
        avoidCollisions
      >
        <React.Suspense
          fallback={
            <div className="flex h-[320px] w-[320px] items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          }
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
