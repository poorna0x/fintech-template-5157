import React, { useEffect, useState } from 'react';
import { Database, Loader2, PenLine, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  applyEmailSourceRecord,
  EMAIL_SOURCE_MIN_SEARCH_LEN,
  fetchEmailSourceOptions,
  getCrmSourceLabel,
  getEmailSourceSearchHint,
  supportsCrmSource,
  type EmailSourceMode,
  type EmailSourceOption,
} from '@/lib/admin-email-sources';
import type { AdminEmailTemplateType } from '@/lib/admin-email-templates';

interface EmailSourcePickerProps {
  templateType: AdminEmailTemplateType;
  sourceMode: EmailSourceMode;
  onSourceModeChange: (mode: EmailSourceMode) => void;
  selectedSourceId: string | null;
  onSelectedSourceIdChange: (id: string | null) => void;
  onApply: (result: Awaited<ReturnType<typeof applyEmailSourceRecord>>) => void;
  disabled?: boolean;
}

export default function EmailSourcePicker({
  templateType,
  sourceMode,
  onSourceModeChange,
  selectedSourceId,
  onSelectedSourceIdChange,
  onApply,
  disabled,
}: EmailSourcePickerProps) {
  const [options, setOptions] = useState<EmailSourceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const crmSupported = supportsCrmSource(templateType);
  const sourceLabel = getCrmSourceLabel(templateType);
  const searchHint = getEmailSourceSearchHint(templateType);

  useEffect(() => {
    setOptions([]);
    setSearch('');
    setHasSearched(false);
  }, [templateType, sourceMode]);

  const handleSearch = async () => {
    if (!crmSupported || sourceMode !== 'crm') return;

    const q = search.trim();
    if (q.length < EMAIL_SOURCE_MIN_SEARCH_LEN) {
      toast.error(`Type at least ${EMAIL_SOURCE_MIN_SEARCH_LEN} characters to search`);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    const rows = await fetchEmailSourceOptions(templateType, q);
    setOptions(rows);
    setLoading(false);

    if (!rows.length) {
      toast.message('No matches — try a different search or use manual entry');
    }
  };

  const handleSelect = async (option: EmailSourceOption) => {
    onSelectedSourceIdChange(option.id);
    setApplying(true);
    const result = await applyEmailSourceRecord(templateType, option.id);
    setApplying(false);
    if (!result) {
      toast.error('Could not load record — try again or enter manually');
      return;
    }
    onApply(result);
    toast.success(`Loaded ${sourceLabel.toLowerCase()} details`);
  };

  const emptyMessage = (() => {
    if (loading) return null;
    if (!hasSearched) {
      return `Enter at least ${EMAIL_SOURCE_MIN_SEARCH_LEN} characters and click Search`;
    }
    return 'No matches — try a different search';
  })();

  if (!crmSupported) return null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-medium text-slate-800">Data source</Label>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <Button
            type="button"
            size="sm"
            variant={sourceMode === 'crm' ? 'default' : 'ghost'}
            className="h-8 px-3 text-xs"
            onClick={() => onSourceModeChange('crm')}
            disabled={disabled}
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            From CRM
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sourceMode === 'manual' ? 'default' : 'ghost'}
            className="h-8 px-3 text-xs"
            onClick={() => {
              onSourceModeChange('manual');
              onSelectedSourceIdChange(null);
            }}
            disabled={disabled}
          >
            <PenLine className="w-3.5 h-3.5 mr-1.5" />
            Manual
          </Button>
        </div>
      </div>

      {sourceMode === 'crm' && (
        <div className="space-y-2">
          {searchHint && <p className="text-xs text-slate-500">{searchHint}</p>}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={
                  templateType === 'booking_confirmation'
                    ? 'Customer name, phone, or ID…'
                    : templateType === 'invoice'
                      ? 'Invoice or customer…'
                      : `Search ${sourceLabel.toLowerCase()}…`
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearch();
                  }
                }}
                className="pl-9 bg-white"
                disabled={disabled || loading}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={disabled || loading}
              onClick={() => void handleSearch()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-1.5" />
                  Search
                </>
              )}
            </Button>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            ) : options.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 px-3">{emptyMessage}</p>
            ) : (
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled || applying}
                  onClick={() => void handleSelect(option)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors ${
                    selectedSourceId === option.id ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900 truncate">{option.label}</p>
                  {option.sublabel && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{option.sublabel}</p>
                  )}
                </button>
              ))
            )}
          </div>

          {applying && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Applying record…
            </p>
          )}
        </div>
      )}

      {sourceMode === 'manual' && (
        <p className="text-xs text-slate-500">
          Enter all fields below manually. Attach PDFs in the attachments section when ready to send.
        </p>
      )}
    </div>
  );
}
