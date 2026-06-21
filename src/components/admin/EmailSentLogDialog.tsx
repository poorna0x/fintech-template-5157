import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Mail, RefreshCw, Search } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { getDocumentBrandLabel } from '@/lib/service-brands';

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

type OpenFilter = 'all' | 'opened' | 'not_opened';

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
    booking_confirmation: 'Booking confirmation',
    amc_agreement: 'AMC agreement',
    amc_document: 'AMC document',
    admin_composer: 'Admin email',
    invoice: 'Invoice',
    quotation: 'Quotation',
    service_reminder: 'Service reminder',
    general: 'General',
  };
  return map[type] || type.replace(/_/g, ' ');
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
  const [filter, setFilter] = useState<OpenFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(
    async (
      pageNum: number,
      filterVal: OpenFilter,
      searchVal: string,
      opts?: { forceCount?: boolean }
    ) => {
      setLoading(true);
      setTableMissing(false);
      const includeCount = pageNum === 1 || opts?.forceCount === true;
      const { data, error, count } = await db.sentEmailLogs.list({
        page: pageNum,
        pageSize: PAGE_SIZE,
        filter: filterVal,
        search: searchVal,
        includeCount,
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
      if (count !== undefined) {
        setTotal(count);
      } else if (pageNum === 1 && (data?.length ?? 0) < PAGE_SIZE) {
        setTotal(data?.length ?? 0);
      }
      setLoaded(true);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next !== search) {
        setPage(1);
        setSearch(next);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput, open, search]);

  useEffect(() => {
    if (!open) return;
    void load(page, filter, search, { forceCount: page === 1 });
  }, [open, page, filter, search, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] sm:max-w-3xl max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 shrink-0" />
            Sent email log
          </DialogTitle>
          <DialogDescription>
            Every email sent through the CRM (Hostinger SMTP). Open status uses a tracking pixel when
            enabled — approximate only if the customer&apos;s mail app blocks images. In Gmail, tap
            &quot;Display images&quot; if needed, then refresh this list.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 pb-3 flex flex-col sm:flex-row gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search email or subject…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select
            value={filter}
            onValueChange={(v: OpenFilter) => {
              setFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All emails</SelectItem>
              <SelectItem value="opened">Opened</SelectItem>
              <SelectItem value="not_opened">Not opened yet</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={loading}
            onClick={() => void load(page, filter, search, { forceCount: true })}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 border-t border-border">
          {tableMissing ? (
            <div className="py-10 text-center text-sm text-muted-foreground max-w-md mx-auto">
              Email tracking tables are not set up yet. Run{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">scripts/add-sent-email-logs.sql</code>{' '}
              in the Supabase SQL Editor, then redeploy Netlify.
            </div>
          ) : loading && !loaded ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No sent emails recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-border py-2">
              {rows.map((row) => {
                const opened = Boolean(row.opened_at);
                return (
                  <li key={row.id} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{row.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.recipient_email}</p>
                      </div>
                      {opened ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 shrink-0">
                          Opened
                        </Badge>
                      ) : row.tracking_pixel_enabled ? (
                        <Badge variant="secondary" className="shrink-0">
                          Not opened
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          Tracking off
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Sent {formatLogDate(row.sent_at)}</span>
                      {opened && row.opened_at ? (
                        <span className="text-emerald-700">Opened {formatLogDate(row.opened_at)}</span>
                      ) : null}
                      <span>{formatTemplateType(row.template_type)}</span>
                      <span>{getDocumentBrandLabel(row.document_brand as 'hydrogenro' | 'elevenro')}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!tableMissing && total > PAGE_SIZE ? (
          <div className="px-4 sm:px-6 py-3 border-t border-border flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
