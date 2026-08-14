import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLeadCatalog } from '@/hooks/useLeadCatalog';
import {
  filterSubTypeOptionsForServiceType,
  LEGACY_SERVICE_SUB_TYPE_LABELS,
} from '@/lib/leadCatalog';

type Props = {
  id?: string;
  value: string;
  customValue?: string;
  onChange: (label: string) => void;
  onCustomChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  /** When RO or SOFTENER, hide the other product's "New … Installation" option. */
  serviceType?: string | null;
};

export function ServiceSubTypeSelect({
  id = 'service_sub_type',
  value,
  customValue = '',
  onChange,
  onCustomChange,
  className,
  disabled,
  required,
  label = 'Service Sub Type',
  serviceType,
}: Props) {
  const { subTypes, loading } = useLeadCatalog();
  const catalogOptions = subTypes.length
    ? subTypes
    : LEGACY_SERVICE_SUB_TYPE_LABELS.map((label, i) => ({
        id: String(i),
        label,
        allow_custom_text: label === 'Other',
      }));
  const options = filterSubTypeOptionsForServiceType(catalogOptions, serviceType);

  const optionLabels = new Set(options.map((o) => o.label));
  const allOptions =
    value && !optionLabels.has(value)
      ? [...options, { id: '__current__', label: value, allow_custom_text: false }]
      : options;

  const selected = allOptions.find((o) => o.label === value);
  const showCustom =
    selected?.allow_custom_text || value === 'Other' || value === 'Custom';

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <select
        id={id}
        value={value || ''}
        disabled={disabled || (loading && allOptions.length === 0)}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <option value="">Select sub-service</option>
        {allOptions.map((o) => (
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
          placeholder="Enter sub-service type"
        />
      ) : null}
    </div>
  );
}
