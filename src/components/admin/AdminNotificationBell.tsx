import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, IndianRupee, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POLL_MS = 5 * 60 * 1000;

type Counts = {
  generalReminders: number;
  pendingCustomerPayments: number;
  recentAmcContracts: number;
};

const initialCounts: Counts = {
  generalReminders: 0,
  pendingCustomerPayments: 0,
  recentAmcContracts: 0,
};

export type AdminNotificationBellProps = {
  /** Open in-dashboard AMC list / generator view */
  onOpenAmcView?: () => void;
  className?: string;
};

export function AdminNotificationBell({ onOpenAmcView, className }: AdminNotificationBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await db.adminNotifications.getCounts();
      if (res.error) {
        setLoadError(res.error);
        return;
      }
      setCounts({
        generalReminders: res.generalReminders,
        pendingCustomerPayments: res.pendingCustomerPayments,
        recentAmcContracts: res.recentAmcContracts,
      });
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    const id = window.setInterval(loadCounts, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') loadCounts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadCounts]);

  useEffect(() => {
    if (open) loadCounts();
  }, [open, loadCounts]);

  const total = useMemo(
    () =>
      counts.generalReminders + counts.pendingCustomerPayments + counts.recentAmcContracts,
    [counts]
  );

  /* No bell until first fetch; hide when nothing needs attention today (no red dot unless bell is shown). */
  if (!hasLoaded || total === 0) {
    return null;
  }

  const row = (label: string, n: number, onClick: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        setOpen(false);
      }}
      disabled={n === 0}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors',
        n > 0 ? 'hover:bg-muted/80 cursor-pointer' : 'cursor-default opacity-50'
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <span
        className={cn(
          'tabular-nums font-semibold shrink-0',
          n > 0 ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {n}
      </span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'relative h-9 w-9 shrink-0 touch-manipulation border-gray-300 bg-white hover:bg-gray-50',
            className
          )}
          aria-label={`Notifications: ${total} item${total === 1 ? '' : 's'} need attention today`}
        >
          <Bell className="h-4 w-4 text-gray-700" strokeWidth={2} />
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-1.5rem,22rem)] p-0" align="end" sideOffset={8}>
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">Needs attention</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Today only (local date). Refreshes every few minutes.
          </p>
        </div>
        <div className="max-h-[min(70vh,420px)] overflow-y-auto p-1.5">
          {loading && open ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : loadError ? (
            <p className="px-2 py-3 text-sm text-destructive">{loadError}</p>
          ) : (
            <>
              {row(
                'Reminders (due today)',
                counts.generalReminders,
                () => navigate('/settings'),
                <Calendar className="h-4 w-4" />
              )}
              {row(
                'Customer pending payments (due today)',
                counts.pendingCustomerPayments,
                () => navigate('/settings'),
                <IndianRupee className="h-4 w-4" />
              )}
              {row(
                'AMC agreements (created today)',
                counts.recentAmcContracts,
                () => onOpenAmcView?.(),
                <Shield className="h-4 w-4" />
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
