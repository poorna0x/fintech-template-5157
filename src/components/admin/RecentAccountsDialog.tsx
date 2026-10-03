import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { Plus, Edit, Phone, PhoneOff, PhoneForwarded, Search, Trash2 } from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { supabase } from '@/lib/supabase';
import type { AdminRecentTechCall } from '@/lib/adminRecentTechCallAlerts';

type KnownCustomerCall = {
  id: string;
  source: 'technician' | 'admin';
  actor_id: string | null;
  phone: string;
  customer_name: string;
  direction: 'in' | 'out';
  outcome: 'answered' | 'missed';
  call_at: string;
  actorName: string;
};

const KNOWN_CALL_PAGE = 40;

export type UnknownCallerRowProps = {
  phone: string;
  onWhatsApp: () => void;
  onDismiss: () => void;
};

interface RecentAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  loading?: boolean;
  /** When true, render `customers` as-is (e.g. server-scoped fetch). Otherwise filter to today locally. */
  useCustomersAsIs?: boolean;
  onNewJob: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  /** Admin APK only — incoming number not in CRM (shown above today's list). */
  unknownCaller?: UnknownCallerRowProps | null;
  /** localStorage: tech-call push alerts on this admin device. */
  recentTechCalls?: AdminRecentTechCall[];
  onOpenTechCall?: (row: AdminRecentTechCall) => void;
  onClearTechCalls?: () => void;
  /** Search this phone on the dashboard and close the dialog. */
  onSearchPhone?: (phone: string) => void;
}

function formatWhen(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function techCallLabel(row: AdminRecentTechCall): { title: string; badge: string } {
  const tech = row.techName?.trim() || 'Technician';
  if (row.kind === 'missed_call') {
    return { title: `${tech} missed a customer call`, badge: 'Missed' };
  }
  if (row.kind === 'wrong_line_call') {
    return { title: `${tech} wrong-line call`, badge: 'Wrong line' };
  }
  return { title: `${tech} got a customer call`, badge: 'Call' };
}

const RecentAccountsDialog: React.FC<RecentAccountsDialogProps> = ({
  open,
  onOpenChange,
  customers,
  loading = false,
  useCustomersAsIs = false,
  onNewJob,
  onEditCustomer,
  unknownCaller = null,
  recentTechCalls = [],
  onOpenTechCall,
  onClearTechCalls,
  onSearchPhone,
}) => {
  const [knownCalls, setKnownCalls] = useState<KnownCustomerCall[]>([]);
  const [knownLoading, setKnownLoading] = useState(false);
  const [knownLoadingMore, setKnownLoadingMore] = useState(false);
  const [knownHasMore, setKnownHasMore] = useState(false);
  const [knownMissing, setKnownMissing] = useState(false);

  const loadKnownCalls = useCallback(async (olderThan?: string) => {
    if (olderThan) setKnownLoadingMore(true);
    else setKnownLoading(true);
    let query = supabase
      .from('known_customer_calls')
      .select('id,source,actor_id,phone,customer_name,direction,outcome,call_at')
      .order('call_at', { ascending: false })
      .limit(KNOWN_CALL_PAGE);
    if (olderThan) query = query.lt('call_at', olderThan);
    const { data, error } = await query;
    if (error) {
      const missing =
        String(error.code || '') === '42P01' ||
        String(error.code || '') === 'PGRST205' ||
        /known_customer_calls/i.test(String(error.message || ''));
      if (!olderThan) {
        setKnownCalls([]);
        setKnownMissing(missing);
        setKnownHasMore(false);
      }
      setKnownLoading(false);
      setKnownLoadingMore(false);
      return;
    }
    const rows = (data || []) as Omit<KnownCustomerCall, 'actorName'>[];
    const techIds = [
      ...new Set(
        rows.filter((row) => row.source === 'technician' && row.actor_id).map((row) => row.actor_id as string)
      ),
    ];
    const names = new Map<string, string>();
    if (techIds.length > 0) {
      const { data: techs } = await supabase.from('technicians').select('id, full_name').in('id', techIds);
      for (const tech of techs || []) {
        const name = String(tech.full_name || '').trim();
        if (name) names.set(tech.id, name);
      }
    }
    const mapped = rows.map((row) => ({
      ...row,
      actorName:
        row.source === 'admin'
          ? 'Admin'
          : names.get(row.actor_id || '') || 'Technician',
    }));
    setKnownMissing(false);
    setKnownHasMore(mapped.length === KNOWN_CALL_PAGE);
    setKnownCalls((prev) => (olderThan ? [...prev, ...mapped] : mapped));
    setKnownLoading(false);
    setKnownLoadingMore(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadKnownCalls();
  }, [open, loadKnownCalls]);
  const todayCustomers = useCustomersAsIs
    ? customers
    : customers
        .filter((customer) => {
          const customerSince = customer.customer_since || (customer as any).customerSince;
          if (!customerSince) return false;
          const createdDate = new Date(customerSince);
          const today = new Date();
          return createdDate.toDateString() === today.toDateString();
        })
        .sort((a, b) => {
          const dateA = new Date(a.customer_since || (a as any).customerSince || 0);
          const dateB = new Date(b.customer_since || (b as any).customerSince || 0);
          return dateB.getTime() - dateA.getTime();
        });

  const callRows = useMemo(
    () => [...recentTechCalls].sort((a, b) => b.at - a.at).slice(0, 40),
    [recentTechCalls]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recent Accounts</DialogTitle>
          <DialogDescription>
            Known customer calls, plus accounts created today ({new Date().toLocaleDateString()})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {unknownCaller ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-100/80 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                    >
                      Not in CRM
                    </Badge>
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      {unknownCaller.phone}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                    Incoming call — send WhatsApp intro for location and filter photo.
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 flex-1 bg-green-600 text-white hover:bg-green-700 sm:flex-none sm:min-w-[7.5rem]"
                    onClick={unknownCaller.onWhatsApp}
                  >
                    <WhatsAppIcon className="mr-1.5 h-4 w-4 shrink-0" />
                    WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 sm:flex-none"
                    onClick={unknownCaller.onDismiss}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="space-y-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Recent callers</h3>
              <p className="text-xs text-muted-foreground">
                Customer calls from technician and admin phones · Tap a row to search
              </p>
            </div>
            {knownLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading calls…</p>
            ) : knownMissing ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Run the known-customer calls script in Supabase, then reopen this list.
              </p>
            ) : knownCalls.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No customer calls saved yet.</p>
            ) : (
              <div className="space-y-2">
                {knownCalls.map((row) => {
                  const badge =
                    row.direction === 'out' ? 'Wrong line' : row.outcome === 'missed' ? 'Missed' : 'Call';
                  const Icon =
                    row.direction === 'out' ? PhoneForwarded : row.outcome === 'missed' ? PhoneOff : Phone;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full text-left border border-border rounded-lg p-3 sm:p-4 transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        if (!onSearchPhone) return;
                        onSearchPhone(row.phone);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex gap-2 min-w-0">
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {badge}
                            </Badge>
                            <span className="text-sm font-semibold text-foreground">{row.customer_name}</span>
                            <Search className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-mono tabular-nums font-semibold text-foreground">{row.phone}</span>
                            <span> · {row.actorName}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(row.call_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {knownHasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={knownLoadingMore}
                    onClick={() => {
                      const oldest = knownCalls[knownCalls.length - 1]?.call_at;
                      if (oldest) void loadKnownCalls(oldest);
                    }}
                  >
                    {knownLoadingMore ? 'Loading…' : 'Load older calls'}
                  </Button>
                ) : null}
              </div>
            )}
          </section>

          {callRows.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">Customer call alerts</h3>
                  <p className="text-xs text-muted-foreground">
                    Saved on this device (last 24 hours) · Tap a row to search
                  </p>
                </div>
                {onClearTechCalls ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-muted-foreground"
                    onClick={onClearTechCalls}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                {callRows.map((row) => {
                  const { title, badge } = techCallLabel(row);
                  const Icon =
                    row.kind === 'missed_call'
                      ? PhoneOff
                      : row.kind === 'wrong_line_call'
                        ? PhoneForwarded
                        : Phone;
                  const searchable = Boolean(onOpenTechCall);
                  return (
                    <button
                      key={`${row.phone}-${row.at}-${row.kind}`}
                      type="button"
                      disabled={!searchable}
                      className={
                        'w-full text-left border border-border rounded-lg p-3 sm:p-4 transition-colors ' +
                        (searchable
                          ? 'hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                          : '')
                      }
                      onClick={() => {
                        if (!onOpenTechCall) return;
                        onOpenTechCall(row);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex gap-2 min-w-0">
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {badge}
                            </Badge>
                            <span className="text-sm font-semibold text-foreground">{title}</span>
                            {searchable ? (
                              <Search className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                            <span className="font-medium text-foreground/80">Contact</span>
                            <span className="font-mono tabular-nums font-semibold text-foreground">
                              {row.phone}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatWhen(row.at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Created today</h3>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading…</p>
              </div>
            ) : todayCustomers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p>
                  {unknownCaller ? 'No other accounts created today.' : 'No accounts created today.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">
                            {customer.customer_id || (customer as any).customerId}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${customerNameClassName(customer)}`}
                          >
                            {customer.fullName || customer.full_name}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            <span className="font-medium">Phone:</span> {customer.phone}
                            {customer.alternate_phone && ` / ${customer.alternate_phone}`}
                          </p>
                          <p>
                            <span className="font-medium">Email:</span>{' '}
                            {customer.email &&
                            customer.email.trim() &&
                            !customer.email.toLowerCase().includes('nomail') &&
                            !customer.email.toLowerCase().includes('no@mail')
                              ? customer.email
                              : 'nomail@mail'}
                          </p>
                          <p>
                            <span className="font-medium">Service:</span>{' '}
                            {customer.service_type || 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created:{' '}
                            {new Date(
                              customer.customer_since || (customer as any).customerSince || ''
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onNewJob(customer);
                            onOpenChange(false);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          New Job
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onEditCustomer(customer);
                            onOpenChange(false);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecentAccountsDialog;
