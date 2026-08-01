import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type DocumentPaymentStatus,
  resolveDocumentPayment,
} from '@/lib/document-payment';
import {
  type EditableNumber,
  displayEditableNumber,
  num,
  parseEditableNumberInput,
} from '@/lib/editable-number-input';

type DocumentPaymentStatusCardProps = {
  title: string;
  description: string;
  paymentStatus: DocumentPaymentStatus;
  onPaymentStatusChange: (status: DocumentPaymentStatus) => void;
  amountReceived: EditableNumber;
  onAmountReceivedChange: (value: EditableNumber) => void;
  totalAmount: number;
  children?: ReactNode;
};

/** Shared Paid / Partial / Pending controls for bill & tax invoice generators. */
export default function DocumentPaymentStatusCard({
  title,
  description,
  paymentStatus,
  onPaymentStatusChange,
  amountReceived,
  onAmountReceivedChange,
  totalAmount,
  children,
}: DocumentPaymentStatusCardProps) {
  const payment = resolveDocumentPayment({
    paymentStatus,
    totalAmount,
    amountPaid: num(amountReceived),
  });

  return (
    <Card className="border-2 border-amber-200 bg-amber-50/40">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg text-amber-900">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-600">{description}</p>
        <div>
          <Label htmlFor="doc-payment-status">Payment status</Label>
          <Select
            value={paymentStatus}
            onValueChange={(v: DocumentPaymentStatus) => onPaymentStatusChange(v)}
          >
            <SelectTrigger id="doc-payment-status" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PAID">Paid in full</SelectItem>
              <SelectItem value="PARTIAL">Partial payment</SelectItem>
              <SelectItem value="PENDING">Payment pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentStatus === 'PARTIAL' && (
          <div>
            <Label htmlFor="doc-amount-received">Amount received (₹)</Label>
            <Input
              id="doc-amount-received"
              type="number"
              min={0}
              max={totalAmount}
              value={displayEditableNumber(amountReceived)}
              onChange={(e) => onAmountReceivedChange(parseEditableNumberInput(e.target.value))}
              className="mt-1"
            />
            <p className="text-xs text-gray-600 mt-1">
              Balance due: ₹{payment.balance.toLocaleString('en-IN')}
            </p>
          </div>
        )}
        {paymentStatus === 'PENDING' && (
          <p className="text-sm text-amber-900 font-medium">
            Full amount pending: ₹{totalAmount.toLocaleString('en-IN')}
          </p>
        )}
        {paymentStatus === 'PAID' && (
          <p className="text-sm text-green-800 font-medium">
            Received in full: ₹{totalAmount.toLocaleString('en-IN')}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
