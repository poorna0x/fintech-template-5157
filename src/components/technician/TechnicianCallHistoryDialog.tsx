import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, Phone, PhoneIncoming, PhoneMissed, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

type TechnicianCall = {
  id: string;
  customer_name: string;
  phone: string;
  outcome: 'answered' | 'missed';
  call_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicianId: string;
};

const PAGE_SIZE = 40;

function formatCallAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function TechnicianCallHistoryDialog({
  open,
  onOpenChange,
  technicianId,
}: Props) {
  const [calls, setCalls] = useState<TechnicianCall[]>([]);
  const callsRef = useRef<TechnicianCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TechnicianCall | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = useCallback(async (reset = true) => {
    if (!technicianId) return;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    let query = supabase
      .from('technician_call_history')
      .select('id,customer_name,phone,outcome,call_at')
      .eq('technician_id', technicianId)
      .order('call_at', { ascending: false })
      .limit(PAGE_SIZE);
    const oldest = reset ? null : callsRef.current[callsRef.current.length - 1]?.call_at;
    if (oldest) query = query.lt('call_at', oldest);
    const { data, error: loadError } = await query;
    if (loadError) {
      if (reset) {
        callsRef.current = [];
        setCalls([]);
        setHasMore(false);
      }
      setError('Could not load call history');
    } else {
      const next = (data || []) as TechnicianCall[];
      const merged = reset ? next : [...callsRef.current, ...next];
      callsRef.current = merged;
      setCalls(merged);
      setHasMore(next.length === PAGE_SIZE);
    }
    if (reset) setLoading(false);
    else setLoadingMore(false);
  }, [technicianId]);

  useEffect(() => {
    if (open) void loadCalls(true);
  }, [open, loadCalls]);

  const confirmDelete = async () => {
    if (!deleteTarget || !technicianId) return;
    setDeleting(true);
    let query = supabase
      .from('technician_call_history')
      .delete()
      .eq('technician_id', technicianId);
    if (deleteTarget !== 'all') query = query.eq('id', deleteTarget.id);
    const { error: deleteError } = await query;
    if (deleteError) {
      toast.error('Could not delete call history');
    } else if (deleteTarget === 'all') {
      callsRef.current = [];
      setCalls([]);
      setHasMore(false);
      toast.success('Call history cleared');
    } else {
      const remaining = callsRef.current.filter((call) => call.id !== deleteTarget.id);
      callsRef.current = remaining;
      setCalls(remaining);
      toast.success('Call removed');
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-sky-600" />
              Customer Call History
            </DialogTitle>
            <DialogDescription>
              Answered and missed customer calls received on this technician account.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25 p-3">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading calls…
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => void loadCalls()}>
                  Try again
                </Button>
              </div>
            ) : calls.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
                <PhoneIncoming className="mb-3 h-8 w-8 opacity-50" />
                <p className="text-sm font-medium">No customer calls recorded</p>
                <p className="mt-1 text-xs">New answered and missed calls will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {calls.map((call) => {
                  const missed = call.outcome === 'missed';
                  return (
                    <article key={call.id} className="rounded-xl border bg-card p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-full p-2 ${missed ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {missed ? <PhoneMissed className="h-4 w-4" /> : <PhoneIncoming className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold break-words">{call.customer_name}</p>
                              <p className="text-sm text-muted-foreground">{call.phone}</p>
                            </div>
                            <Badge variant={missed ? 'destructive' : 'secondary'}>
                              {missed ? 'Missed' : 'Answered'}
                            </Badge>
                          </div>
                          <time className="mt-2 block text-xs text-muted-foreground" dateTime={call.call_at}>
                            {formatCallAt(call.call_at)}
                          </time>
                          <div className="mt-3 flex gap-2">
                            <Button asChild size="sm" variant="outline" className="flex-1">
                              <a href={`tel:${call.phone}`}>
                                <Phone className="mr-2 h-4 w-4" />
                                Call back
                              </a>
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Delete ${call.customer_name} call`}
                              onClick={() => setDeleteTarget(call)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {hasMore && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loadingMore}
                    onClick={() => void loadCalls(false)}
                  >
                    {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Load older calls
                  </Button>
                )}
              </div>
            )}
          </div>

          {calls.length > 0 && (
            <div className="border-t bg-background p-3">
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget('all')}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear all call history
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget === 'all' ? 'Clear all call history?' : 'Delete this call?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'all'
                ? 'This permanently removes every call in your history.'
                : 'This permanently removes this call from your history.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
