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

const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30] as const) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      out.push({ value: `${hh}:${mm}`, label: format12h(h, m) });
    }
  }
  return out;
})();

export function formatTimePickerLabel(value: string): string {
  const opt = TIME_OPTIONS.find((o) => o.value === value);
  if (opt) return opt.label;
  const [h, m] = value.split(':').map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) return format12h(h, m);
  return value;
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
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('h-10 w-full font-normal', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[min(280px,45vh)]">
        {TIME_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
