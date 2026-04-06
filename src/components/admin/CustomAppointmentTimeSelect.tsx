import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  APPOINTMENT_HALF_HOUR_OPTIONS,
  APPOINTMENT_PRESET_VALUES,
  isPresetAppointmentTime,
  OTHER_TIME_SELECT_VALUE,
} from '@/lib/adminAppointmentTimes';

export const UNSET_TIME_SELECT_VALUE = 'unset-time';

type Props = {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
  optional?: boolean;
};

export function CustomAppointmentTimeSelect({ id, value, onChange, className, optional }: Props) {
  const [showExact, setShowExact] = useState(() => Boolean(value && !isPresetAppointmentTime(value)));

  useEffect(() => {
    if (value && APPOINTMENT_PRESET_VALUES.has(value)) {
      setShowExact(false);
    }
  }, [value]);

  const selectValue =
    showExact
      ? OTHER_TIME_SELECT_VALUE
      : optional && !value
        ? UNSET_TIME_SELECT_VALUE
        : value && APPOINTMENT_PRESET_VALUES.has(value)
          ? value
          : value && !APPOINTMENT_PRESET_VALUES.has(value)
            ? OTHER_TIME_SELECT_VALUE
            : '';

  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Select
        value={selectValue || undefined}
        onValueChange={(v) => {
          if (v === UNSET_TIME_SELECT_VALUE) {
            setShowExact(false);
            onChange('');
            return;
          }
          if (v === OTHER_TIME_SELECT_VALUE) {
            setShowExact(true);
            return;
          }
          setShowExact(false);
          onChange(v);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose a time" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(320px,50vh)]">
          {optional && <SelectItem value={UNSET_TIME_SELECT_VALUE}>Leave unset</SelectItem>}
          {APPOINTMENT_HALF_HOUR_OPTIONS.map(({ value: v, label }) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
          <SelectItem value={OTHER_TIME_SELECT_VALUE}>Other (exact time)…</SelectItem>
        </SelectContent>
      </Select>

      {showExact && (
        <div className="space-y-1">
          <Label
            htmlFor={id ? `${id}-exact` : 'appointment-time-exact'}
            className="text-xs text-muted-foreground font-normal"
          >
            Exact time
          </Label>
          <Input
            id={id ? `${id}-exact` : 'appointment-time-exact'}
            type="time"
            step={60}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="max-w-[10rem] bg-background"
          />
        </div>
      )}
    </div>
  );
}
