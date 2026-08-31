import { useEffect, useRef, useState } from 'react';
import type { Customer } from '@/types';
import {
  formatCustomerFullAddressLine,
  normalizeCustomerAddress,
} from '@/lib/customer-address';
import {
  getCustomerLocationSlice,
  getPrimaryLocationLabel,
  getSecondaryLocationLabel,
  hasAlternateLocation,
  type CustomerLocationVariant,
} from '@/lib/customer-locations';
import { Label } from '@/components/ui/label';
import { MapPin, Ban } from 'lucide-react';

export type DocumentAddressChoice = CustomerLocationVariant | 'omit';

type AddressShape = {
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
};

const EMPTY_ADDRESS: AddressShape = {
  street: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
};

export function documentAddressForChoice(
  customer: Customer | null | undefined,
  choice: DocumentAddressChoice
): AddressShape {
  if (!customer || choice === 'omit') return { ...EMPTY_ADDRESS };
  const slice = getCustomerLocationSlice(customer, choice);
  const normalized = normalizeCustomerAddress(slice.address, {
    visible_address: slice.visibleAddress,
    formattedAddress: slice.location?.formattedAddress,
  });
  return {
    street: normalized.street || normalized.visible_address || '',
    area: normalized.area,
    city: normalized.city,
    state: normalized.state,
    pincode: normalized.pincode,
  };
}

export type DocumentAddressFields = AddressShape;

/** Pick a saved site, then optionally edit those fields for this document only. */
export function useDocumentSiteAddress(customerId: string | undefined) {
  const [addressChoice, setAddressChoice] = useState<DocumentAddressChoice>('primary');
  const addressEditedRef = useRef(false);

  useEffect(() => {
    addressEditedRef.current = false;
    setAddressChoice('primary');
  }, [customerId]);

  const selectSite = (choice: DocumentAddressChoice, address: AddressShape) => {
    addressEditedRef.current = false;
    setAddressChoice(choice);
    return address;
  };

  const markAddressEdited = () => {
    addressEditedRef.current = true;
  };

  const isAddressEdited = () => addressEditedRef.current;

  return {
    addressChoice,
    setAddressChoice,
    selectSite,
    markAddressEdited,
    isAddressEdited,
  };
}

export function formatDocumentAddress(address: AddressShape): string {
  return formatCustomerFullAddressLine(normalizeCustomerAddress(address));
}

export type AddressChoiceOption<T extends string> = {
  value: T;
  title: string;
  subtitle: string;
  icon?: 'pin' | 'omit';
};

type OptionCardProps = {
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  icon: 'pin' | 'omit';
};

function OptionCard({ title, subtitle, selected, onSelect, icon }: OptionCardProps) {
  const Icon = icon === 'omit' ? Ban : MapPin;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex min-h-[3.75rem] w-full items-start gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all active:scale-[0.99] ${
        selected
          ? 'border-blue-500 bg-blue-50/90 shadow-sm ring-2 ring-blue-500/20'
          : 'border-border bg-background hover:border-blue-300/80 hover:bg-muted/30'
      }`}
    >
      <Icon
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
          selected ? 'text-blue-600' : 'text-muted-foreground'
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold leading-tight ${
            selected ? 'text-blue-900' : 'text-foreground'
          }`}
        >
          {title}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {selected && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" aria-hidden />
      )}
    </button>
  );
}

type AddressChoiceCardsProps<T extends string> = {
  label?: string;
  options: AddressChoiceOption<T>[];
  value: T;
  onSelect: (value: T) => void;
};

/** Card-style radio group that shows each site's location label plus its address. */
export function AddressChoiceCards<T extends string>({
  label = 'Address for this document',
  options,
  value,
  onSelect,
}: AddressChoiceCardsProps<T>) {
  if (options.length < 2) return null;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className={`grid gap-2 ${options.length > 1 ? 'sm:grid-cols-2' : ''}`}
      >
        {options.map((option) => (
          <OptionCard
            key={option.value}
            icon={option.icon ?? 'pin'}
            title={option.title}
            subtitle={option.subtitle}
            selected={value === option.value}
            onSelect={() => onSelect(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

type DocumentAddressSelectorProps = {
  customer: Customer | null | undefined;
  value: DocumentAddressChoice;
  onChange: (choice: DocumentAddressChoice, address: AddressShape) => void;
  allowOmit?: boolean;
  label?: string;
};

export function DocumentAddressSelector({
  customer,
  value,
  onChange,
  allowOmit = false,
  label = 'Address for this document',
}: DocumentAddressSelectorProps) {
  const hasSecondary = customer ? hasAlternateLocation(customer) : false;
  if (!customer || (!allowOmit && !hasSecondary)) return null;

  const primary = formatDocumentAddress(documentAddressForChoice(customer, 'primary'));
  const secondary = formatDocumentAddress(documentAddressForChoice(customer, 'secondary'));
  const primaryLabel = getPrimaryLocationLabel(customer);
  const secondaryLabel = getSecondaryLocationLabel(customer);

  const options: AddressChoiceOption<DocumentAddressChoice>[] = [
    { value: 'primary', title: primaryLabel, subtitle: primary || 'No address saved' },
  ];
  if (hasSecondary) {
    options.push({
      value: 'secondary',
      title: secondaryLabel,
      subtitle: secondary || 'No address saved',
    });
  }
  if (allowOmit) {
    options.push({
      value: 'omit',
      title: 'No address',
      subtitle: 'Print name and phone only',
      icon: 'omit',
    });
  }

  return (
    <AddressChoiceCards
      label={label}
      options={options}
      value={value}
      onSelect={(choice) => onChange(choice, documentAddressForChoice(customer, choice))}
    />
  );
}
