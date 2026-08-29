import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GitMerge, Loader2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { db, type CustomerMergePreview, type CustomerMergeResult } from '@/lib/supabase';

interface MergeCustomerPick {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  customer_since?: string | null;
}

interface MergeCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  disabledTitle?: string;
}

function pickDefaultPrimary(a: MergeCustomerPick, b: MergeCustomerPick): string {
  const aTime = a.customer_since ? new Date(a.customer_since).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.customer_since ? new Date(b.customer_since).getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime < bTime ? a.id : b.id;
  return a.customer_id.localeCompare(b.customer_id) <= 0 ? a.id : b.id;
}

function rowToPick(row: Record<string, unknown>): MergeCustomerPick {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id ?? ''),
    full_name: String(row.full_name ?? ''),
    phone: String(row.phone ?? ''),
    customer_since: (row.customer_since as string | null | undefined) ?? null,
  };
}

function isMissingMergeRpc(error: unknown): boolean {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : '';
  return /preview_merge_customers_admin|merge_customers_admin|could not find the function/i.test(msg);
}

function CustomerPicker({
  label,
  query,
  onQueryChange,
  onSearch,
  results,
  searching,
  searched,
  selected,
  onSelect,
  excludeId,
}: {
  label: string;
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  results: MergeCustomerPick[];
  searching: boolean;
  searched: boolean;
  selected: MergeCustomerPick | null;
  onSelect: (row: MergeCustomerPick | null) => void;
  excludeId?: string;
}) {
  const canSearch = query.trim().length >= 2 && !searching;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selected ? (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3 bg-muted/40">
          <div className="min-w-0">
            <p className="font-medium truncate">{selected.full_name}</p>
            <p className="text-sm text-muted-foreground">
              {selected.customer_id} · {selected.phone}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSearch) {
                    e.preventDefault();
                    onSearch();
                  }
                }}
                placeholder="Search name, phone, or customer ID"
                className="pl-9"
              />
            </div>
            <Button type="button" variant="secondary" disabled={!canSearch} onClick={onSearch}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="text-xs text-muted-foreground">Type at least 2 characters, then Search.</p>
          )}
          {searched && !searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No customers found.</p>
          )}
          {results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border divide-y">
              {results
                .filter((r) => r.id !== excludeId)
                .map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                      onClick={() => onSelect(row)}
                    >
                      <span className="font-medium">{row.full_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {row.customer_id} · {row.phone}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function PreviewSummary({ preview }: { preview: CustomerMergePreview }) {
  const { counts, primary, secondary } = preview;
  const total =
    counts.jobs +
    counts.amc_contracts +
    counts.call_history +
    counts.tax_invoices +
    counts.reminders;

  return (
    <div className="rounded-md border p-3 space-y-2 text-sm bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
      <p className="font-medium">
        Will move {total} linked record{total === 1 ? '' : 's'} from{' '}
        <strong>{secondary.customer_id}</strong> into <strong>{primary.customer_id}</strong>, then
        delete <strong>{secondary.customer_id}</strong>.
      </p>
      <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
        {counts.jobs > 0 && <li>{counts.jobs} job(s)</li>}
        {counts.amc_contracts > 0 && <li>{counts.amc_contracts} AMC contract(s)</li>}
        {counts.call_history > 0 && <li>{counts.call_history} call log(s)</li>}
        {counts.tax_invoices > 0 && <li>{counts.tax_invoices} invoice link(s)</li>}
        {counts.reminders > 0 && <li>{counts.reminders} reminder(s)</li>}
        {total === 0 && <li>No linked records — profile fields will still be merged.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">
        {secondary.phone} will be saved as alternate phone on {primary.customer_id} (if slot is
        free). The keeper&apos;s address and map pin stay; the duplicate&apos;s location is only
        used if the keeper has none.
      </p>
    </div>
  );
}

export default function MergeCustomersDialog({
  open,
  onOpenChange,
  disabled,
  disabledTitle,
}: MergeCustomersDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [customerA, setCustomerA] = useState<MergeCustomerPick | null>(null);
  const [customerB, setCustomerB] = useState<MergeCustomerPick | null>(null);
  const [primaryId, setPrimaryId] = useState<string>('');
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [resultsA, setResultsA] = useState<MergeCustomerPick[]>([]);
  const [resultsB, setResultsB] = useState<MergeCustomerPick[]>([]);
  const [searchingA, setSearchingA] = useState(false);
  const [searchingB, setSearchingB] = useState(false);
  const [searchedA, setSearchedA] = useState(false);
  const [searchedB, setSearchedB] = useState(false);
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setCustomerA(null);
    setCustomerB(null);
    setPrimaryId('');
    setQueryA('');
    setQueryB('');
    setResultsA([]);
    setResultsB([]);
    setSearchedA(false);
    setSearchedB(false);
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    setIsMerging(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (customerA && customerB && !primaryId) {
      setPrimaryId(pickDefaultPrimary(customerA, customerB));
    }
  }, [customerA, customerB, primaryId]);

  const runSearch = useCallback(async (query: string, side: 'a' | 'b') => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    if (side === 'a') setSearchingA(true);
    else setSearchingB(true);
    try {
      const { data, error } = await db.customers.searchSlim(trimmed, 8);
      if (error) throw error;
      const rows = (data ?? []).map((r) => rowToPick(r as Record<string, unknown>));
      if (side === 'a') setResultsA(rows);
      else setResultsB(rows);
    } catch {
      if (side === 'a') setResultsA([]);
      else setResultsB([]);
    } finally {
      if (side === 'a') {
        setSearchingA(false);
        setSearchedA(true);
      } else {
        setSearchingB(false);
        setSearchedB(true);
      }
    }
  }, []);

  const secondaryId =
    customerA && customerB && primaryId
      ? primaryId === customerA.id
        ? customerB.id
        : customerA.id
      : '';

  useEffect(() => {
    if (!customerA || !customerB || !primaryId || !secondaryId) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    void db.customers.previewMerge(primaryId, secondaryId).then(({ data, error }) => {
      if (cancelled) return;
      setPreviewLoading(false);
      if (error) {
        if (isMissingMergeRpc(error)) {
          setPreviewError(
            'Merge RPC not installed. Run scripts/merge-customers-admin-rpc.sql in Supabase SQL Editor first.'
          );
        } else {
          setPreviewError(error.message || 'Could not load merge preview.');
        }
        setPreview(null);
        return;
      }
      setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [customerA, customerB, primaryId, secondaryId]);

  const canContinue =
    customerA &&
    customerB &&
    customerA.id !== customerB.id &&
    primaryId &&
    preview &&
    !previewLoading &&
    !previewError;

  const handleMerge = async () => {
    if (!primaryId || !secondaryId) return;
    setIsMerging(true);
    try {
      const { data, error } = await db.customers.merge(primaryId, secondaryId);
      if (error) {
        if (isMissingMergeRpc(error)) {
          toast.error('Merge RPC not installed. Run scripts/merge-customers-admin-rpc.sql in Supabase.');
        } else {
          toast.error(error.message || 'Merge failed.');
        }
        return;
      }
      const result = data as CustomerMergeResult;
      toast.success(
        `Merged ${result.deleted_customer_id} into ${result.primary_customer_id} (${result.jobs_moved} job(s) moved).`
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Merge failed.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isMerging) onOpenChange(next);
      }}
    >
      <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            {step === 1 ? 'Merge duplicate customers' : 'Confirm merge'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Combine two customer records when the same person booked with a new number. All jobs and history move to the keeper; the duplicate is deleted.'
              : 'This cannot be undone. Review the summary below before merging.'}
          </DialogDescription>
        </DialogHeader>

        {disabled ? (
          <Alert>
            <AlertDescription>{disabledTitle ?? 'Restricted for your role.'}</AlertDescription>
          </Alert>
        ) : step === 1 ? (
          <div className="space-y-4 py-1">
            <CustomerPicker
              label="Customer 1"
              query={queryA}
              onQueryChange={(v) => {
                setQueryA(v);
                setSearchedA(false);
                setResultsA([]);
              }}
              onSearch={() => void runSearch(queryA, 'a')}
              results={resultsA}
              searching={searchingA}
              searched={searchedA}
              selected={customerA}
              onSelect={(row) => {
                setCustomerA(row);
                setQueryA('');
                setResultsA([]);
                setSearchedA(false);
                if (row && customerB) setPrimaryId(pickDefaultPrimary(row, customerB));
              }}
              excludeId={customerB?.id}
            />
            <CustomerPicker
              label="Customer 2"
              query={queryB}
              onQueryChange={(v) => {
                setQueryB(v);
                setSearchedB(false);
                setResultsB([]);
              }}
              onSearch={() => void runSearch(queryB, 'b')}
              results={resultsB}
              searching={searchingB}
              searched={searchedB}
              selected={customerB}
              onSelect={(row) => {
                setCustomerB(row);
                setQueryB('');
                setResultsB([]);
                setSearchedB(false);
                if (row && customerA) setPrimaryId(pickDefaultPrimary(customerA, row));
              }}
              excludeId={customerA?.id}
            />

            {customerA && customerB && customerA.id === customerB.id && (
              <Alert variant="destructive">
                <AlertDescription>Select two different customers.</AlertDescription>
              </Alert>
            )}

            {customerA && customerB && customerA.id !== customerB.id && (
              <div className="space-y-2">
                <Label>Keep this record (primary)</Label>
                <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="space-y-2">
                  {[customerA, customerB].map((c) => (
                    <div key={c.id} className="flex items-center space-x-2 rounded-md border p-3">
                      <RadioGroupItem value={c.id} id={`primary-${c.id}`} />
                      <Label htmlFor={`primary-${c.id}`} className="font-normal cursor-pointer flex-1">
                        <span className="font-medium">{c.full_name}</span>
                        <span className="text-muted-foreground text-sm block">
                          {c.customer_id} · {c.phone}
                          {primaryId === c.id ? ' · keeper' : ' · will be deleted after merge'}
                        </span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            {previewLoading && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
              </p>
            )}
            {previewError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}
            {preview && !previewLoading && <PreviewSummary preview={preview} />}
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {preview && <PreviewSummary preview={preview} />}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The duplicate customer record will be permanently deleted. Jobs, invoices, and
                reports will show under the keeper only.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isMerging}
            onClick={() => {
              if (step === 2) setStep(1);
              else onOpenChange(false);
            }}
          >
            {step === 2 ? 'Back' : 'Cancel'}
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              disabled={!canContinue || disabled}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700"
              disabled={isMerging || !preview}
              onClick={() => void handleMerge()}
            >
              {isMerging ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Merging…
                </>
              ) : (
                'Merge permanently'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
