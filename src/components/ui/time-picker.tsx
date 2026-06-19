import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

function format12h(hours24: number, minutes: number): string {
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const h12 = hours24 % 12 || 12;
  const mm = minutes.toString().padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

function formatHourLabel(hours24: number): string {
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const h12 = hours24 % 12 || 12;
  return `${h12} ${period}`;
}

function parseTimeValue(value: string): { hours: number; minutes: number } {
  const [h, m] = (value || '00:00').split(':').map((part) => Number(part));
  return {
    hours: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    minutes: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

function toTimeValue(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: formatHourLabel(h),
}));

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({
  value: String(m),
  label: m.toString().padStart(2, '0'),
}));

export function formatTimePickerLabel(value: string): string {
  const { hours, minutes } = parseTimeValue(value);
  return format12h(hours, minutes);
}

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function TimePicker({
  value,
  onChange,
  placeholder = 'Pick time',
  className,
  disabled,
}: TimePickerProps) {
  const { hours, minutes } = parseTimeValue(value);
  const hasValue = Boolean(value);

  return (
    <div className={cn('flex items-center gap-1.5 w-full', className)}>
      <Select
        value={hasValue ? String(hours) : undefined}
        onValueChange={(hour) => onChange(toTimeValue(Number(hour), minutes))}
        disabled={disabled}
      >
        <SelectTrigger className="h-10 flex-1 min-w-0 font-normal" aria-label="Hour">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(280px,45vh)]">
          {HOUR_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground shrink-0" aria-hidden>
        :
      </span>
      <Select
        value={hasValue ? String(minutes) : undefined}
        onValueChange={(minute) => onChange(toTimeValue(hours, Number(minute)))}
        disabled={disabled}
      >
        <SelectTrigger className="h-10 w-[4.75rem] shrink-0 font-normal" aria-label="Minute">
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(280px,45vh)]">
          {MINUTE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
