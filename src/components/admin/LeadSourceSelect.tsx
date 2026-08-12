import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLeadCatalog } from '@/hooks/useLeadCatalog';
import { LEGACY_LEAD_SOURCE_LABELS } from '@/lib/leadCatalog';

type Props = {
  id?: string;
  value: string;
  customValue?: string;
  onChange: (label: string) => void;
  onCustomChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  disabled?: boolean;
};

export function LeadSourceSelect({
  id = 'lead_source',
  value,
  customValue = '',
  onChange,
  onCustomChange,
  required,
  className,
  disabled,
}: Props) {
  const { sources, loading } = useLeadCatalog();
  const options = sources.length
    ? sources
    : LEGACY_LEAD_SOURCE_LABELS.map((label, i) => ({
        id: String(i),
        label,
        allow_custom_text: label === 'Other',
      }));

  const selected = options.find((o) => o.label === value);
  const showCustom = selected?.allow_custom_text || value === 'Other';

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>Lead Source{required ? ' *' : ''}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled || loading}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <option value="">Select lead source</option>
        {options.map((o) => (
          <option key={o.id || o.label} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
      {showCustom && onCustomChange ? (
        <Input
          id={`${id}_custom`}
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Enter lead source"
        />
      ) : null}
    </div>
  );
}
