import React from 'react';
import { Inbox } from 'lucide-react';

/** Ongoing tab empty board: compact, full-width, works on a phone. */
export function OngoingJobsEmptyState() {
  return (
    <div
      className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center sm:px-6 sm:py-10"
      role="status"
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 sm:h-12 sm:w-12">
        <Inbox className="h-5 w-5 text-sky-700" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold tracking-tight text-slate-700 sm:text-[15px]">
        No ongoing jobs
      </p>
    </div>
  );
}
