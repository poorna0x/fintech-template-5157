import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Mail, RefreshCw, Search, Trash2, X, ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { cn } from '@/lib/utils';
import { forceLightSelectContentClass, forceLightThemeClass } from '@/lib/force-light-theme';
import { DatePicker } from '@/components/ui/date-picker';
import {
  describeSentEmailLogDateRange,
  getTodayIstDate,
  isSentEmailLogTodayOnly,
  type SentEmailLogBrandFilter,
  type SentEmailLogDateFilter,
  type SentEmailLogOpenFilter,
  type SentEmailLogQueryFilters,
  type SentEmailLogTemplateFilter,
} from '@/lib/sent-email-log-filters';

export type SentEmailLogRow = {
  id: string;
  recipient_email: string;
  subject: string;
  template_type: string;
  document_brand: string;
  sent_at: string;
  opened_at: string | null;
  tracking_pixel_enabled: boolean;
};

const PAGE_SIZE = 20;

function formatLogDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTemplateType(type: string): string {
  const map: Record<string, string> = {
    job_completion: 'Job completion',
    booking_confirmation: 'Booking',
    amc_agreement: 'AMC agreement',
    amc_document: 'AMC document',
    admin_composer: 'Admin email',
    invoice: 'Invoice',
    quotation: 'Quotation',
    service_reminder: 'Reminder',
    general: 'General',
  };
  return map[type] || type.replace(/_/g, ' ');
}

const OPEN_FILTER_LABELS: Record<SentEmailLogOpenFilter, string> = {
  all: 'All status',
  opened: 'Opened',
  not_opened: 'Not opened',
  tracking_off: 'Tracking off',
};

function describeActiveFilters(filters: SentEmailLogQueryFilters): string[] {
  const parts: string[] = [];
  const dateLabel = describeSentEmailLogDateRange(filters);
  if (dateLabel) {
    parts.push(dateLabel);
  }
  if (filters.filter && filters.filter !== 'all') {
    parts.push(OPEN_FILTER_LABELS[filters.filter]);
  }
  if (filters.brand && filters.brand !== 'all') {
    parts.push(getDocumentBrandLabel(filters.brand));
  }
  if (filters.templateType && filters.templateType !== 'all') {
    parts.push(formatTemplateType(filters.templateType));
  }
  if (filters.search?.trim()) {
    parts.push(`“${filters.search.trim()}”`);
  }
  return parts;
}

interface SentEmailLogDateFilterRowProps {
  dateFilter: SentEmailLogDateFilter;
  dateFrom: string;
  dateTo: string;
  disabled?: boolean;
  onDateFilterChange: (value: SentEmailLogDateFilter) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

function SentEmailLogDateFilterRow({
  dateFilter,
  dateFrom,
  dateTo,
  disabled,
  onDateFilterChange,
  onDateFromChange,
  onDateToChange,
}: SentEmailLogDateFilterRowProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Select
        value={dateFilter}
        onValueChange={(v: SentEmailLogDateFilter) => onDateFilterChange(v)}
      >
        <SelectTrigger className="h-9 bg-background text-xs sm:text-sm sm:min-w-[9.5rem]">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent className={forceLightSelectContentClass()}>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="last7">Last 7 days</SelectItem>
          <SelectItem value="range">Date range</SelectItem>
          <SelectItem value="all">All dates</SelectItem>
        </SelectContent>
      </Select>
      {dateFilter === 'range' ? (
        <>
          <DatePicker
            value={dateFrom}
            onChange={(value) => {
              if (!value) return;
              onDateFromChange(value);
            }}
            placeholder="From"
            disabled={disabled}
            className="h-9 text-xs sm:text-sm"
          />
          <DatePicker
            value={dateTo}
            onChange={(value) => {
              if (!value) return;
              onDateToChange(value);
            }}
            placeholder="To"
            disabled={disabled}
            className="h-9 text-xs sm:text-sm"
          />
        </>
      ) : null}
    </div>
  );
}

interface EmailSentLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailSentLogDialog({ open, onOpenChange }: EmailSentLogDialogProps) {
  const [rows, setRows] = useState<SentEmailLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dateFilter, setDateFilter] = useState<SentEmailLogDateFilter>('today');
  const [dateFrom, setDateFrom] = useState(() => getTodayIstDate());
  const [dateTo, setDateTo] = useState(() => getTodayIstDate());
  const [openFilter, setOpenFilter] = useState<SentEmailLogOpenFilter>('all');
  const [brandFilter, setBrandFilter] = useState<SentEmailLogBrandFilter>('all');
  const [templateFilter, setTemplateFilter] = useState<SentEmailLogTemplateFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deleteDateFilter, setDeleteDateFilter] = useState<SentEmailLogDateFilter>('today');
  const [deleteDateFrom, setDeleteDateFrom] = useState(() => getTodayIstDate());
  const [deleteDateTo, setDeleteDateTo] = useState(() => getTodayIstDate());
  const [deleteOpenFilter, setDeleteOpenFilter] = useState<SentEmailLogOpenFilter>('all');
  const [deleteBrandFilter, setDeleteBrandFilter] = useState<SentEmailLogBrandFilter>('all');
  const [deleteTemplateFilter, setDeleteTemplateFilter] = useState<SentEmailLogTemplateFilter>('all');
  const [deleteSearch, setDeleteSearch] = useState('');
  const [deleteSearchInput, setDeleteSearchInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Pick<
    SentEmailLogRow,
    'id' | 'subject' | 'recipient_email'
  > | null>(null);

  const queryFilters = useMemo<SentEmailLogQueryFilters>(
    () => ({
      filter: openFilter,
      brand: brandFilter,
      templateType: templateFilter,
      search,
      dateFilter,
      dateFrom: dateFilter === 'range' ? dateFrom : undefined,
      dateTo: dateFilter === 'range' ? dateTo : undefined,
    }),
    [openFilter, brandFilter, templateFilter, search, dateFilter, dateFrom, dateTo]
  );

  const deleteFilters = useMemo<SentEmailLogQueryFilters>(
    () => ({
      filter: deleteOpenFilter,
      brand: deleteBrandFilter,
      templateType: deleteTemplateFilter,
      search: deleteSearch,
      dateFilter: deleteDateFilter,
      dateFrom: deleteDateFilter === 'range' ? deleteDateFrom : undefined,
      dateTo: deleteDateFilter === 'range' ? deleteDateTo : undefined,
    }),
    [
      deleteOpenFilter,
      deleteBrandFilter,
      deleteTemplateFilter,
      deleteSearch,
      deleteDateFilter,
      deleteDateFrom,
      deleteDateTo,
    ]
  );

  const isTodayOnly = isSentEmailLogTodayOnly(queryFilters);

  const deleteFilterLabels = useMemo(() => describeActiveFilters(deleteFilters), [deleteFilters]);

  const load = useCallback(
    async (pageNum: number, filters: SentEmailLogQueryFilters) => {
      setLoading(true);
      setTableMissing(false);
      const { data, error, count } = await db.sentEmailLogs.list({
        page: pageNum,
        pageSize: PAGE_SIZE,
        includeCount: true,
        ...filters,
      });
      setLoading(false);

      if (error) {
        const msg = error.message || '';
        if (/sent_email_logs|could not find the table|schema cache/i.test(msg)) {
          setTableMissing(true);
          setRows([]);
          setTotal(0);
          return;
        }
        toast.error(msg || 'Could not load sent emails');
        return;
      }

      setRows((data as SentEmailLogRow[]) || []);
      setTotal(count ?? 0);
      setLoaded(true);
    },
    []
  );

  const runSearch = useCallback(() => {
    const next = searchInput.trim();
    const filters: SentEmailLogQueryFilters = {
      filter: openFilter,
      brand: brandFilter,
      templateType: templateFilter,
      search: next,
      dateFilter,
      dateFrom: dateFilter === 'range' ? dateFrom : undefined,
      dateTo: dateFilter === 'range' ? dateTo : undefined,
    };
    setPage(1);
    if (next === search) {
      void load(1, filters);
    } else {
      setSearch(next);
    }
  }, [searchInput, search, openFilter, brandFilter, templateFilter, dateFilter, dateFrom, dateTo, load]);

  const runDeleteSearch = useCallback(() => {
    setDeleteSearch(deleteSearchInput.trim());
  }, [deleteSearchInput]);

  const syncDeleteFiltersFromView = useCallback(() => {
    setDeleteDateFilter(dateFilter);
    setDeleteDateFrom(dateFrom);
    setDeleteDateTo(dateTo);
    setDeleteOpenFilter(openFilter);
    setDeleteBrandFilter(brandFilter);
    setDeleteTemplateFilter(templateFilter);
    setDeleteSearch(search);
    setDeleteSearchInput(search);
  }, [dateFilter, dateFrom, dateTo, openFilter, brandFilter, templateFilter, search]);

  useEffect(() => {
    if (open) return;
    setDeleteSectionOpen(false);
    setSingleDeleteOpen(false);
    setPendingDelete(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void load(page, queryFilters);
  }, [open, page, queryFilters, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openSingleDelete = (row: SentEmailLogRow) => {
    setPendingDelete({
      id: row.id,
      subject: row.subject,
      recipient_email: row.recipient_email,
    });
    setSingleDeleteOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    const { error } = await db.sentEmailLogs.deleteById(pendingDelete.id);
    setDeletingId(null);
    setSingleDeleteOpen(false);
    setPendingDelete(null);
    if (error) {
      toast.error(error.message || 'Could not delete');
      return;
    }
    toast.success('Log deleted');
    void load(page, queryFilters);
  };

  const openBulkDelete = async () => {
    const { count, error } = await db.sentEmailLogs.countMatching(deleteFilters);
    if (error) {
      toast.error(error.message || 'Could not count logs');
      return;
    }
    if (count === 0) {
      toast.message('No logs match the delete filters');
      return;
    }
    setBulkDeleteCount(count);
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    const { error } = await db.sentEmailLogs.deleteMatching(deleteFilters);
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    if (error) {
      toast.error(error.message || 'Could not delete logs');
      return;
    }
    toast.success(`Deleted ${bulkDeleteCount} log${bulkDeleteCount === 1 ? '' : 's'}`);
    setPage(1);
    void load(1, queryFilters);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className={forceLightThemeClass(
            'max-w-[100vw] sm:max-w-2xl w-full h-[100dvh] sm:h-[min(88dvh,720px)] max-h-[100dvh] flex flex-col gap-0 p-0 overflow-hidden rounded-none sm:rounded-lg'
          )}
        >
          <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 shrink-0 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
                <Mail className="w-5 h-5 shrink-0 text-primary" />
                <span className="truncate">Sent email log</span>
              </DialogTitle>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={loading}
                  onClick={() => void load(page, queryFilters)}
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Close">
                    <X className="w-4 h-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 sm:px-5 py-3 shrink-0 space-y-2 border-b border-border bg-muted/20">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 h-9 bg-background"
                  placeholder="Search email or subject…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 shrink-0 px-3 sm:px-4"
                disabled={loading}
                onClick={runSearch}
              >
                Search
              </Button>
            </div>
            <SentEmailLogDateFilterRow
              dateFilter={dateFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
              disabled={loading}
              onDateFilterChange={(value) => {
                setDateFilter(value);
                setPage(1);
              }}
              onDateFromChange={(value) => {
                setDateFrom(value);
                setPage(1);
              }}
              onDateToChange={(value) => {
                setDateTo(value);
                setPage(1);
              }}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Select
                value={openFilter}
                onValueChange={(v: SentEmailLogOpenFilter) => {
                  setOpenFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 bg-background text-xs sm:text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className={forceLightSelectContentClass()}>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="not_opened">Not opened</SelectItem>
                  <SelectItem value="tracking_off">Tracking off</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={brandFilter}
                onValueChange={(v: SentEmailLogBrandFilter) => {
                  setBrandFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 bg-background text-xs sm:text-sm">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent className={forceLightSelectContentClass()}>
                  <SelectItem value="all">All brands</SelectItem>
                  <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                  <SelectItem value="elevenro">Eleven RO</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={templateFilter}
                onValueChange={(v: SentEmailLogTemplateFilter) => {
                  setTemplateFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 bg-background text-xs sm:text-sm col-span-2 sm:col-span-1">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className={forceLightSelectContentClass()}>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="job_completion">Job completion</SelectItem>
                  <SelectItem value="booking_confirmation">Booking</SelectItem>
                  <SelectItem value="amc_document">AMC</SelectItem>
                  <SelectItem value="admin_composer">Admin email</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="quotation">Quotation</SelectItem>
                  <SelectItem value="service_reminder">Reminder</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!tableMissing ? (
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                {total > 0 ? (
                  <>
                    {total} email{total === 1 ? '' : 's'}
                    {isTodayOnly ? ' sent today' : null}
                  </>
                ) : isTodayOnly ? (
                  'No emails sent today'
                ) : (
                  'No emails match these filters'
                )}
              </p>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3">
            {tableMissing ? (
              <div className="py-10 text-center text-sm text-muted-foreground max-w-md mx-auto">
                Run{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">scripts/add-sent-email-logs.sql</code>{' '}
                in Supabase SQL Editor.
              </div>
            ) : loading && !loaded ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No emails match these filters.</div>
            ) : (
              <ul className="space-y-2 sm:space-y-2.5">
                {rows.map((row) => {
                  const opened = Boolean(row.opened_at);
                  return (
                    <li
                      key={row.id}
                      className="rounded-xl border border-border bg-card p-3 sm:p-3.5 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium leading-snug line-clamp-2">{row.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.recipient_email}</p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {opened ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] sm:text-xs px-1.5 py-0">
                                Opened
                              </Badge>
                            ) : row.tracking_pixel_enabled ? (
                              <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0">
                                Not opened
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">
                                Tracking off
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 font-normal">
                              {formatTemplateType(row.template_type)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 font-normal">
                              {getDocumentBrandLabel(row.document_brand as 'hydrogenro' | 'elevenro')}
                            </Badge>
                          </div>
                          <p className="text-[11px] sm:text-xs text-muted-foreground pt-0.5">
                            Sent {formatLogDate(row.sent_at)}
                            {opened && row.opened_at ? (
                              <span className="text-emerald-700"> · Opened {formatLogDate(row.opened_at)}</span>
                            ) : null}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === row.id}
                          onClick={() => openSingleDelete(row)}
                          title="Delete log"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-background">
            {total > PAGE_SIZE ? (
              <div className="px-4 sm:px-5 py-3 border-b border-border">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums text-center">
                    {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)}
                    <span className="hidden sm:inline"> of {total.toLocaleString()}</span>
                    <span className="sm:hidden"> / {total.toLocaleString()}</span>
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 touch-manipulation flex-1 sm:flex-none max-w-[9rem] sm:max-w-none"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ArrowLeft className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Previous</span>
                    </Button>
                    <span className="text-sm text-foreground/90 tabular-nums px-2 text-center min-w-[5.5rem]">
                      {page} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 touch-manipulation flex-1 sm:flex-none max-w-[9rem] sm:max-w-none"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ArrowRight className="h-4 w-4 sm:ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <Collapsible open={deleteSectionOpen} onOpenChange={setDeleteSectionOpen}>
              <CollapsibleContent>
                <div className="border-b border-destructive/25 bg-destructive/[0.03] px-4 sm:px-5 py-3 space-y-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={syncDeleteFiltersFromView}
                    >
                      Use view filters
                    </Button>
                  </div>
                  <SentEmailLogDateFilterRow
                    dateFilter={deleteDateFilter}
                    dateFrom={deleteDateFrom}
                    dateTo={deleteDateTo}
                    onDateFilterChange={setDeleteDateFilter}
                    onDateFromChange={setDeleteDateFrom}
                    onDateToChange={setDeleteDateTo}
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Select
                      value={deleteOpenFilter}
                      onValueChange={(v: SentEmailLogOpenFilter) => setDeleteOpenFilter(v)}
                    >
                      <SelectTrigger className="h-9 bg-background text-xs sm:text-sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent className={forceLightSelectContentClass()}>
                        <SelectItem value="all">All status</SelectItem>
                        <SelectItem value="opened">Opened</SelectItem>
                        <SelectItem value="not_opened">Not opened</SelectItem>
                        <SelectItem value="tracking_off">Tracking off</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={deleteBrandFilter}
                      onValueChange={(v: SentEmailLogBrandFilter) => setDeleteBrandFilter(v)}
                    >
                      <SelectTrigger className="h-9 bg-background text-xs sm:text-sm">
                        <SelectValue placeholder="Brand" />
                      </SelectTrigger>
                      <SelectContent className={forceLightSelectContentClass()}>
                        <SelectItem value="all">All brands</SelectItem>
                        <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                        <SelectItem value="elevenro">Eleven RO</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={deleteTemplateFilter}
                      onValueChange={(v: SentEmailLogTemplateFilter) => setDeleteTemplateFilter(v)}
                    >
                      <SelectTrigger className="h-9 bg-background text-xs sm:text-sm col-span-2 sm:col-span-1">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent className={forceLightSelectContentClass()}>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="job_completion">Job completion</SelectItem>
                        <SelectItem value="booking_confirmation">Booking</SelectItem>
                        <SelectItem value="amc_document">AMC</SelectItem>
                        <SelectItem value="admin_composer">Admin email</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                        <SelectItem value="quotation">Quotation</SelectItem>
                        <SelectItem value="service_reminder">Reminder</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 bg-background flex-1 min-w-0 text-sm"
                      placeholder="Search email or subject…"
                      value={deleteSearchInput}
                      onChange={(e) => setDeleteSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          runDeleteSearch();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 shrink-0 px-3"
                      onClick={runDeleteSearch}
                    >
                      Search
                    </Button>
                  </div>
                  {deleteFilterLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {deleteFilterLabels.map((label) => (
                        <Badge key={label} variant="secondary" className="text-[10px] font-normal">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Today&apos;s logs only (default delete scope)</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/5"
                    disabled={tableMissing || bulkDeleting}
                    onClick={() => void openBulkDelete()}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete matching logs
                  </Button>
                </div>
              </CollapsibleContent>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-10 w-full justify-between rounded-none px-4 sm:px-5 text-xs sm:text-sm font-medium',
                    deleteSectionOpen && 'border-t border-border'
                  )}
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Delete logs
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 shrink-0 text-muted-foreground transition-transform',
                      deleteSectionOpen && 'rotate-180'
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={singleDeleteOpen}
        onOpenChange={(next) => {
          setSingleDeleteOpen(next);
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This cannot be undone.</p>
                {pendingDelete ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-1">
                    <p className="font-medium text-foreground line-clamp-2">{pendingDelete.subject}</p>
                    <p className="text-xs truncate">{pendingDelete.recipient_email}</p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel disabled={Boolean(deletingId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(deletingId)}
              onClick={(e) => {
                e.preventDefault();
                void confirmSingleDelete();
              }}
            >
              {deletingId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteCount} log{bulkDeleteCount === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Deletes {bulkDeleteCount} log{bulkDeleteCount === 1 ? '' : 's'} matching the delete
                  filters below. This cannot be undone.
                </p>
                {deleteFilterLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {deleteFilterLabels.map((label) => (
                      <Badge key={label} variant="secondary" className="text-xs font-normal">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs">All sent email logs</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmBulkDelete();
              }}
            >
              {bulkDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
