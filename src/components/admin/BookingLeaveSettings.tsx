import { useEffect, useState } from 'react';
import { CalendarOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsActionCard } from '@/components/admin/SettingsActionCard';
import {
  addBookingLeaveDate,
  deletePassedBookingLeaveDates,
  fetchBookingLeaveDates,
  istTodayIso,
  removeBookingLeaveDate,
} from '@/lib/bookingLeaveDates';

function formatLeave(day: string): string {
  const parsed = new Date(`${day}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** Settings — dates when the website and WhatsApp cannot book a visit. */
export function BookingLeaveSettings() {
  const [dates, setDates] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      await deletePassedBookingLeaveDates();
      const rows = await fetchBookingLeaveDates();
      if (active) setDates(rows);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function add() {
    if (busy || !pick) return;
    setBusy(true);
    try {
      const result = await addBookingLeaveDate(pick);
      if (!result.ok) {
        toast.error(result.error || 'Could not save leave');
        return;
      }
      setDates((prev) => Array.from(new Set([...prev, pick])).sort());
      setPick('');
      toast.success('Leave saved. That day is closed for booking.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(day: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await removeBookingLeaveDate(day);
      if (!result.ok) {
        toast.error(result.error || 'Could not remove leave');
        return;
      }
      setDates((prev) => prev.filter((item) => item !== day));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="section-booking-leave" className="scroll-mt-24 space-y-3">
      <SettingsActionCard
        title="Booking leave"
        description="Add a day off. Website and WhatsApp booking cannot pick that date. The day drops off by itself after it has passed."
        icon={<CalendarOff />}
        actions={
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Input
              type="date"
              min={istTodayIso()}
              value={pick}
              onChange={(event) => setPick(event.target.value)}
              className="h-11 sm:h-9 w-[11.5rem]"
              aria-label="Leave date"
            />
            <Button
              type="button"
              className="h-11 sm:h-9 shrink-0"
              disabled={busy || !pick}
              onClick={() => void add()}
            >
              Add
            </Button>
          </div>
        }
      />
      {dates.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dates.map((day) => (
            <button
              key={day}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-sm"
              onClick={() => void remove(day)}
              disabled={busy}
            >
              {formatLeave(day)}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Remove</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
