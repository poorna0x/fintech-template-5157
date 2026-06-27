import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, CheckCircle2, XCircle, BadgeCheck } from 'lucide-react';
import {
  warrantyStatus,
  formatWarrantyDate,
  GENERAL_WARRANTY_POLICY,
  GENERAL_WARRANTY_TERMS,
  type PublicWarranty,
  type PublicAmcInfo,
} from '@/lib/warranty';

/** Small label/value pair used in the customer summary grid. */
export const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-foreground break-words">{value}</dd>
  </div>
);

/**
 * Polished, read-friendly warranty card shared by the public /warranty page and the
 * admin warranty manager so both show coverage exactly the same way. `actions` lets
 * the admin view drop edit/delete controls into the header without changing the look.
 */
export const WarrantyCard: React.FC<{ warranty: PublicWarranty; actions?: React.ReactNode }> = ({
  warranty,
  actions,
}) => {
  // Header status uses the latest COVERED item end date (or the warranty end date).
  const coveredItems = warranty.items.filter((it) => it.covered !== false);
  const overallEnd =
    coveredItems.length > 0
      ? coveredItems.reduce((max, it) => (it.end_date > max ? it.end_date : max), coveredItems[0].end_date)
      : warranty.end_date;
  const overall = warrantyStatus(overallEnd);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Warranty</p>
              <p className="text-xs text-muted-foreground">
                From {formatWarrantyDate(warranty.start_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end flex-wrap w-full sm:w-auto">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${overall.toneClass}`}>
              {overall.label}
            </span>
            {actions ? <div className="flex items-center gap-0.5 flex-wrap justify-end">{actions}</div> : null}
          </div>
        </div>

        {warranty.items.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Covered until <span className="font-medium text-foreground">{formatWarrantyDate(warranty.end_date)}</span>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {warranty.items.map((it) => {
              const notCovered = it.covered === false;
              const st = warrantyStatus(it.end_date);
              return (
                <div
                  key={it.id}
                  className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <span className={`text-sm font-medium break-words ${notCovered ? 'text-muted-foreground' : ''}`}>
                      {it.label}
                    </span>
                    {!notCovered && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Until {formatWarrantyDate(it.end_date)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium self-start sm:self-center">
                    {notCovered ? (
                      <>
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Not covered</span>
                      </>
                    ) : (
                      <>
                        {st.active ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={st.active ? 'text-emerald-700' : 'text-red-600'}>{st.label}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {warranty.notes && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Terms & conditions
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{warranty.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** AMC coverage banner shown when the customer has an active Annual Maintenance Contract. */
export const AmcBanner: React.FC<{ amc: PublicAmcInfo }> = ({ amc }) => (
  <Card className="border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20">
    <CardContent className="p-4 sm:p-5 flex items-start gap-3">
      <BadgeCheck className="w-6 h-6 text-indigo-600 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-indigo-900 dark:text-indigo-200">Covered under AMC</p>
        <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
          You have an active Annual Maintenance Contract
          {amc.end_date ? ` valid till ${formatWarrantyDate(amc.end_date)}` : ''}. Services and covered
          parts are provided as agreed in your AMC agreement.
        </p>
      </div>
    </CardContent>
  </Card>
);

/** Fallback card shown when a customer has no specific warranty recorded. */
export const GeneralWarrantyCard: React.FC = () => (
  <Card>
    <CardContent className="p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">No specific warranty on record</p>
          <p className="text-sm text-muted-foreground mt-1">{GENERAL_WARRANTY_POLICY}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Terms &amp; conditions
        </p>
        <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
          {GENERAL_WARRANTY_TERMS.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    </CardContent>
  </Card>
);
