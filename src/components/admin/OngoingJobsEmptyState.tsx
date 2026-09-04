import React from 'react';

/** Ongoing tab empty board: paused job card + one line. */
export function OngoingJobsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24" role="status">
      <div className="ongoing-idle-scene" aria-hidden="true">
        <svg className="ongoing-idle-svg" viewBox="0 0 200 220" fill="none">
          <rect className="ongoing-idle-card" x="28" y="22" width="144" height="176" rx="18" />
          <rect x="70" y="10" width="60" height="22" rx="7" fill="#0ea5e9" />
          <rect x="88" y="16" width="24" height="8" rx="4" fill="#e0f2fe" />

          <g className="ongoing-idle-row ongoing-idle-row--1">
            <rect x="46" y="52" width="108" height="28" rx="8" />
            <rect x="58" y="62" width="52" height="8" rx="4" />
            <circle cx="132" cy="66" r="5" />
          </g>
          <g className="ongoing-idle-row ongoing-idle-row--2">
            <rect x="46" y="90" width="108" height="28" rx="8" />
            <rect x="58" y="100" width="40" height="8" rx="4" />
            <circle cx="132" cy="104" r="5" />
          </g>
          <g className="ongoing-idle-row ongoing-idle-row--3">
            <rect x="46" y="128" width="108" height="28" rx="8" />
            <rect x="58" y="138" width="46" height="8" rx="4" />
            <circle cx="132" cy="142" r="5" />
          </g>

          <circle className="ongoing-idle-pause-ring" cx="100" cy="176" r="14" />
          <rect x="94" y="169" width="3.5" height="14" rx="1.2" fill="#0369a1" />
          <rect x="102.5" y="169" width="3.5" height="14" rx="1.2" fill="#0369a1" />
        </svg>
      </div>
      <p className="mt-6 text-[15px] font-semibold tracking-tight text-slate-600">
        No jobs in progress.
      </p>
    </div>
  );
}
