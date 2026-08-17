import type { Customer } from '@/types';
import {
  getCustomerLocationSlice,
  hasAlternateLocation,
  type CustomerLocationVariant,
} from '@/lib/customer-locations';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const address = getCustomerLocationSlice(customer, choice).address;
  return {
    street: String(address?.street || ''),
    area: String(address?.area || ''),
    city: String(address?.city || ''),
    state: String(address?.state || ''),
    pincode: String(address?.pincode || ''),
  };
}

export function formatDocumentAddress(address: AddressShape): string {
  return [address.street, address.area, address.city, address.state, address.pincode]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
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
  if (!customer || (!allowOmit && !hasAlternateLocation(customer))) return null;

  const primary = documentAddressForChoice(customer, 'primary');
  const secondary = documentAddressForChoice(customer, 'secondary');
  const hasSecondary = hasAlternateLocation(customer);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={(raw) => {
          const choice = raw as DocumentAddressChoice;
          onChange(choice, documentAddressForChoice(customer, choice));
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose address" />
        </SelectTrigger>
        <SelectContent>
          {allowOmit ? <SelectItem value="omit">Omit address</SelectItem> : null}
          <SelectItem value="primary">
            Primary{formatDocumentAddress(primary) ? ` · ${formatDocumentAddress(primary)}` : ''}
          </SelectItem>
          {hasSecondary ? (
            <SelectItem value="secondary">
              Secondary
              {formatDocumentAddress(secondary) ? ` · ${formatDocumentAddress(secondary)}` : ''}
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {value === 'omit'
          ? 'The document will not show an address.'
          : formatDocumentAddress(documentAddressForChoice(customer, value)) || 'No address saved.'}
      </p>
    </div>
  );
}
