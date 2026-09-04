import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Compact month grid height; used to pick top vs bottom before open. */
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

function parseYmd(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(value: string | undefined): string {
  const d = parseYmd(value);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
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
  const selected = parseYmd(value);
  const displayText = formatDisplayDate(value) || placeholder;

  const handleOpenChange = (next: boolean) => {
    if (next && triggerRef.current) {
      setSide(pickPopoverSide(triggerRef.current));
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
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            onChange?.(toYmd(d));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
