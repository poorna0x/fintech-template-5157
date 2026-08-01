import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type PaidTodayMode,
  computePendingBalance,
} from '@/lib/jobPendingPayment';

type PendingPaymentFieldsProps = {
  billAmount: number;
  paidTodayEnabled: boolean;
  onPaidTodayEnabledChange: (v: boolean) => void;
  paidTodayMode: PaidTodayMode | '';
  onPaidTodayModeChange: (v: PaidTodayMode | '') => void;
  paidTodayAmount: string;
  onPaidTodayAmountChange: (v: string) => void;
  partialCashAmount: string;
  onPartialCashAmountChange: (v: string) => void;
  partialOnlineAmount: string;
  onPartialOnlineAmountChange: (v: string) => void;
  promisedDate: string;
  onPromisedDateChange: (v: string) => void;
  sanitizeMoneyInput: (raw: string) => string;
  parseMoneyAmount: (raw: string) => number;
};

/** Shared UI under Payment Mode = Pending Payment (tech + admin complete/edit). */
export default function PendingPaymentFields({
  billAmount,
  paidTodayEnabled,
  onPaidTodayEnabledChange,
  paidTodayMode,
  onPaidTodayModeChange,
  paidTodayAmount,
  onPaidTodayAmountChange,
  partialCashAmount,
  onPartialCashAmountChange,
  partialOnlineAmount,
  onPartialOnlineAmountChange,
  promisedDate,
  onPromisedDateChange,
  sanitizeMoneyInput,
  parseMoneyAmount,
}: PendingPaymentFieldsProps) {
  const paidToday =
    paidTodayEnabled && paidTodayMode === 'PARTIAL'
      ? (parseMoneyAmount(partialCashAmount) || 0) + (parseMoneyAmount(partialOnlineAmount) || 0)
      : paidTodayEnabled
        ? parseMoneyAmount(paidTodayAmount) || 0
        : 0;
  const balance = computePendingBalance(billAmount, paidToday);

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id="paid-today-enabled"
          checked={paidTodayEnabled}
          onCheckedChange={(c) => {
            const on = c === true;
            onPaidTodayEnabledChange(on);
            if (!on) {
              onPaidTodayModeChange('');
              onPaidTodayAmountChange('');
              onPartialCashAmountChange('');
              onPartialOnlineAmountChange('');
            }
          }}
        />
        <div>
          <Label htmlFor="paid-today-enabled" className="cursor-pointer font-medium">
            Anything paid today?
          </Label>
          <p className="text-xs text-muted-foreground">
            If yes, record cash / online / partial for what was collected now. Balance stays pending.
          </p>
        </div>
      </div>

      {paidTodayEnabled && (
        <div className="space-y-3 pl-1">
          <div>
            <Label>How was today’s payment received?</Label>
            <Select
              value={paidTodayMode || undefined}
              onValueChange={(v: PaidTodayMode) => {
                onPaidTodayModeChange(v);
                onPaidTodayAmountChange('');
                onPartialCashAmountChange('');
                onPartialOnlineAmountChange('');
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(paidTodayMode === 'CASH' || paidTodayMode === 'ONLINE') && (
            <div>
              <Label htmlFor="paid-today-amount">Amount paid today (₹)</Label>
              <Input
                id="paid-today-amount"
                type="text"
                inputMode="decimal"
                className="mt-1"
                value={paidTodayAmount}
                onChange={(e) => onPaidTodayAmountChange(sanitizeMoneyInput(e.target.value))}
                placeholder="0"
              />
            </div>
          )}

          {paidTodayMode === 'PARTIAL' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cash (₹)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1"
                  value={partialCashAmount}
                  onChange={(e) => {
                    const v = sanitizeMoneyInput(e.target.value);
                    onPartialCashAmountChange(v);
                    const cash = parseMoneyAmount(v);
                    if (v !== '' && Number.isFinite(cash) && billAmount > 0) {
                      // Leave online editable; do not force = bill − cash (paid today is partial of bill)
                    }
                  }}
                />
              </div>
              <div>
                <Label>Online (₹)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1"
                  value={partialOnlineAmount}
                  onChange={(e) => onPartialOnlineAmountChange(sanitizeMoneyInput(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <Label>
          When will payment be made? <span className="text-red-600">*</span>
        </Label>
        <DatePicker
          value={promisedDate || undefined}
          onChange={(v) => onPromisedDateChange(v ?? '')}
          placeholder="Pick date (required)"
          className="mt-1"
        />
        {!promisedDate ? (
          <p className="text-xs text-red-600 mt-1">Select the date — required.</p>
        ) : null}
      </div>

      <p className="text-sm font-medium text-amber-950">
        Balance pending: ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        {paidToday > 0 ? (
          <span className="font-normal text-muted-foreground">
            {' '}
            (₹{paidToday.toLocaleString('en-IN', { maximumFractionDigits: 2 })} received today)
          </span>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">
        A pending payment for this customer is added in Settings for the date above.
      </p>
    </div>
  );
}
