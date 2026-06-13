import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

interface AmountTracker {
  id: string;
  name: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

interface AmountTrackersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const parseTrackerAmount = (value: unknown): number => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatTrackerAmount = (amount: number): string => {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function AmountTrackersDialog({ open, onOpenChange }: AmountTrackersDialogProps) {
  const [amountTrackers, setAmountTrackers] = useState<AmountTracker[]>([]);
  const [loading, setLoading] = useState(false);
  const [addTrackerDialogOpen, setAddTrackerDialogOpen] = useState(false);
  const [newTrackerName, setNewTrackerName] = useState('');
  const [newTrackerAmount, setNewTrackerAmount] = useState('');
  const [trackerToDelete, setTrackerToDelete] = useState<string | null>(null);
  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>({});
  const [adjustingTrackerId, setAdjustingTrackerId] = useState<string | null>(null);

  const loadAmountTrackers = async () => {
    setLoading(true);
    try {
      const { data, error } = await db.amountTrackers.getAll();
      if (error) throw error;

      setAmountTrackers(
        (data || []).map((row: any) => ({
          id: row.id as string,
          name: (row.name as string) || 'Untitled',
          amount: parseTrackerAmount(row.amount),
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }))
      );
    } catch (error) {
      console.error('Error loading amount trackers:', error);
      toast.error('Failed to load trackers');
    } finally {
      setLoading(false);
    }
  };

  // Load only when the dialog is opened (keeps egress low when unused).
  useEffect(() => {
    if (open) loadAmountTrackers();
  }, [open]);

  const handleAddTracker = () => {
    setNewTrackerName('');
    setNewTrackerAmount('');
    setAddTrackerDialogOpen(true);
  };

  const handleSaveTracker = async () => {
    try {
      const name = newTrackerName.trim();
      if (!name) {
        toast.error('Please enter a name');
        return;
      }

      const amount = newTrackerAmount.trim() === '' ? 0 : parseFloat(newTrackerAmount);
      if (!Number.isFinite(amount)) {
        toast.error('Please enter a valid starting amount');
        return;
      }

      const { error } = await db.amountTrackers.create({ name, amount });
      if (error) throw error;

      toast.success('Tracker created');
      await loadAmountTrackers();
      setAddTrackerDialogOpen(false);
      setNewTrackerName('');
      setNewTrackerAmount('');
    } catch (error: any) {
      console.error('Error saving tracker:', error);
      const errorMsg = error?.message || error?.details || 'Unknown error';
      toast.error('Failed to create tracker: ' + errorMsg);
    }
  };

  const handleAdjustTracker = async (trackerId: string, direction: 'add' | 'subtract') => {
    if (adjustingTrackerId) return;

    const raw = (adjustInputs[trackerId] || '').trim();
    if (!raw) {
      toast.error('Enter an amount first');
      return;
    }

    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }

    const delta = direction === 'add' ? value : -value;
    setAdjustingTrackerId(trackerId);

    try {
      const { data, error } = await db.amountTrackers.adjust(trackerId, delta);
      if (error) throw error;

      const row = data as { id?: string; name?: string; amount?: unknown; updated_at?: string } | null;
      if (row?.id) {
        setAmountTrackers((prev) =>
          prev.map((t) =>
            t.id === row.id
              ? {
                  ...t,
                  amount: parseTrackerAmount(row.amount),
                  updated_at: (row.updated_at as string) || t.updated_at,
                }
              : t
          )
        );
      } else {
        await loadAmountTrackers();
      }

      setAdjustInputs((prev) => ({ ...prev, [trackerId]: '' }));
      toast.success(direction === 'add' ? 'Amount added' : 'Amount subtracted');
    } catch (error) {
      console.error('Error adjusting tracker:', error);
      toast.error('Failed to update amount');
    } finally {
      setAdjustingTrackerId(null);
    }
  };

  const handleDeleteTracker = async (trackerId: string) => {
    try {
      const { error } = await db.amountTrackers.delete(trackerId);
      if (error) throw error;

      toast.success('Tracker deleted');
      await loadAmountTrackers();
      setTrackerToDelete(null);
    } catch (error) {
      console.error('Error deleting tracker:', error);
      toast.error('Failed to delete tracker');
      setTrackerToDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <div className="px-6 mb-2">
              <DialogTitle className="flex items-center justify-center gap-2">
                <DollarSign className="w-5 h-5" />
                Amount Trackers
              </DialogTitle>
              <DialogDescription className="mt-1 text-center hidden sm:block">
                Named running totals — e.g. Cash flow starts at ₹1,000, add ₹100 → ₹1,100.
              </DialogDescription>
            </div>
            <Button onClick={handleAddTracker} size="sm" className="w-full sm:w-auto sm:self-start my-3 sm:my-4">
              <Plus className="w-4 h-4 mr-2" />
              New Tracker
            </Button>
          </DialogHeader>

          <div className="space-y-4">
            {amountTrackers.map((tracker) => (
              <div
                key={tracker.id}
                className="p-4 rounded-lg border border-border dark:border-gray-700 hover:border-border dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg text-foreground dark:text-gray-100 truncate">
                      {tracker.name}
                    </h3>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground/70 mt-0.5">
                      Updated {new Date(tracker.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ₹{formatTrackerAmount(tracker.amount)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={adjustInputs[tracker.id] || ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setAdjustInputs((prev) => ({ ...prev, [tracker.id]: v }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && adjustInputs[tracker.id]?.trim()) {
                        handleAdjustTracker(tracker.id, 'add');
                      }
                    }}
                    className="flex-1"
                    disabled={adjustingTrackerId === tracker.id}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleAdjustTracker(tracker.id, 'add')}
                      disabled={adjustingTrackerId === tracker.id}
                    >
                      {adjustingTrackerId === tracker.id ? '…' : '+ Add'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                      onClick={() => handleAdjustTracker(tracker.id, 'subtract')}
                      disabled={adjustingTrackerId === tracker.id}
                    >
                      {adjustingTrackerId === tracker.id ? '…' : '− Subtract'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 shrink-0"
                      onClick={() => setTrackerToDelete(tracker.id)}
                      disabled={adjustingTrackerId === tracker.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && amountTrackers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No trackers yet. Click &quot;New Tracker&quot; to create one (e.g. Cash flow).
              </div>
            )}
            {loading && amountTrackers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">Loading trackers…</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Amount Tracker Dialog */}
      <Dialog
        open={addTrackerDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddTrackerDialogOpen(false);
            setNewTrackerName('');
            setNewTrackerAmount('');
          }
        }}
      >
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>New Amount Tracker</DialogTitle>
            <DialogDescription>
              Give it a name (e.g. Cash flow) and a starting amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="trackerName">Name</Label>
              <Input
                id="trackerName"
                value={newTrackerName}
                onChange={(e) => setNewTrackerName(e.target.value)}
                placeholder="e.g. Cash flow"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTrackerName.trim()) {
                    handleSaveTracker();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="trackerAmount">Starting amount (₹)</Label>
              <Input
                id="trackerAmount"
                type="text"
                inputMode="decimal"
                value={newTrackerAmount}
                onChange={(e) => setNewTrackerAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 1000"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTrackerDialogOpen(false);
                setNewTrackerName('');
                setNewTrackerAmount('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTracker}
              disabled={!newTrackerName.trim()}
              className="w-full sm:w-auto"
            >
              Create Tracker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Amount Tracker Confirmation */}
      <AlertDialog
        open={trackerToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setTrackerToDelete(null);
        }}
      >
        <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left sm:text-center">
            <AlertDialogTitle className="text-base sm:text-lg font-semibold">
              Delete Tracker
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-muted-foreground mt-2">
              Delete this tracker permanently? The current total will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4 sm:mt-0">
            <AlertDialogCancel
              onClick={() => setTrackerToDelete(null)}
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trackerToDelete) handleDeleteTracker(trackerToDelete);
              }}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm font-medium"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
