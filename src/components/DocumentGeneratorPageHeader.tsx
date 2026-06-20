import React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const accentStyles = {
  green: {
    border: 'border-emerald-200/80',
    bg: 'bg-gradient-to-br from-emerald-50/90 via-white to-white',
    icon: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60',
    title: 'text-emerald-950',
  },
  blue: {
    border: 'border-blue-200/80',
    bg: 'bg-gradient-to-br from-blue-50/90 via-white to-white',
    icon: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200/60',
    title: 'text-blue-950',
  },
  violet: {
    border: 'border-violet-200/80',
    bg: 'bg-gradient-to-br from-violet-50/90 via-white to-white',
    icon: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200/60',
    title: 'text-violet-950',
  },
  amber: {
    border: 'border-amber-200/80',
    bg: 'bg-gradient-to-br from-amber-50/90 via-white to-white',
    icon: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/60',
    title: 'text-amber-950',
  },
} as const;

export type DocumentGeneratorAccent = keyof typeof accentStyles;

export interface DocumentGeneratorActionBarProps {
  draft?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Columns for the primary button row on sm+ screens */
  primaryCols?: 2 | 3;
  secondaryLabel?: string;
  /** Horizontal equal-width buttons without extra chrome */
  compact?: boolean;
}

function PrimaryButtonRow({
  primary,
  cols,
}: {
  primary: React.ReactNode;
  cols: 2 | 3;
}) {
  return (
    <div
      className={cn(
        'grid w-full min-w-0 gap-2',
        cols === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2'
      )}
    >
      {primary}
    </div>
  );
}

function UnifiedActionGrid({
  draft,
  primary,
  primaryCols,
}: {
  draft?: React.ReactNode;
  primary: React.ReactNode;
  primaryCols: 2 | 3;
}) {
  // 3 primary actions (AMC, tax invoice): two rows — drafts, then actions.
  if (primaryCols === 3) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        {draft}
        <PrimaryButtonRow primary={primary} cols={3} />
      </div>
    );
  }

  // 2 primary actions (bill, quotation): single row on xl+, stacked below.
  if (draft) {
    return (
      <div className="w-full min-w-0">
        <div className="hidden xl:grid xl:grid-cols-4 xl:gap-2">
          <div className="col-span-2 min-w-0">{draft}</div>
          {primary}
        </div>
        <div className="flex flex-col gap-2 xl:hidden">
          {draft}
          <PrimaryButtonRow primary={primary} cols={2} />
        </div>
      </div>
    );
  }

  return <PrimaryButtonRow primary={primary} cols={2} />;
}

/** Grouped, full-width action rows for generator toolbars. */
export function DocumentGeneratorActionBar({
  draft,
  primary,
  secondary,
  primaryCols = 2,
  secondaryLabel = 'More options',
  compact = false,
}: DocumentGeneratorActionBarProps) {
  if (compact && !secondary && !draft) {
    return (
      <div
        className={cn(
          'grid w-full min-w-0 gap-2',
          primaryCols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
        )}
      >
        {primary}
      </div>
    );
  }

  if (secondary) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <UnifiedActionGrid draft={draft} primary={primary} primaryCols={primaryCols} />
        <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {secondaryLabel}
          </span>
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {secondary}
          </div>
        </div>
      </div>
    );
  }

  return (
    <UnifiedActionGrid draft={draft} primary={primary} primaryCols={primaryCols} />
  );
}

export interface DocumentGeneratorPageHeaderProps {
  title: string;
  description?: string;
  accent?: DocumentGeneratorAccent;
  /** When true, hides title (e.g. inside a modal that already has a title). */
  embedded?: boolean;
  /** Slim toolbar only — no gradient card wrapper (GST edit, etc.). */
  embeddedCompact?: boolean;
  icon?: React.ReactNode;
  actions: React.ReactNode;
}

export default function DocumentGeneratorPageHeader({
  title,
  description,
  accent = 'green',
  embedded = false,
  embeddedCompact = false,
  icon,
  actions,
}: DocumentGeneratorPageHeaderProps) {
  const styles = accentStyles[accent];

  if (embeddedCompact) {
    return <div className="w-full min-w-0">{actions}</div>;
  }

  if (embedded) {
    return (
      <div
        className={cn(
          'w-full min-w-0 overflow-hidden rounded-xl border shadow-sm p-3 sm:p-4',
          styles.border,
          styles.bg
        )}
      >
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-xl border shadow-sm p-4 sm:p-5',
        styles.border,
        styles.bg
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              styles.icon
            )}
          >
            {icon ?? <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className={cn('text-xl sm:text-2xl font-bold tracking-tight', styles.title)}>
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="w-full min-w-0 border-t border-slate-200/70 pt-4">{actions}</div>
      </div>
    </div>
  );
}

/** Consistent section card heading inside generator forms. */
export const documentSectionTitleClass =
  'flex items-center gap-2 text-base sm:text-lg font-semibold text-slate-800';

/** Shared base for generator toolbar buttons. */
const generatorBtnBase =
  'w-full min-w-0 h-10 shadow-sm inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap font-medium transition-colors';

/** Save to database — blue. */
export const documentSaveBtnClass = cn(
  generatorBtnBase,
  'bg-blue-600 text-white border border-blue-600',
  'hover:bg-blue-700 hover:!text-white hover:border-blue-700',
  'focus-visible:ring-blue-500'
);

/** Generate / print preview — green. */
export const documentGenerateBtnClass = cn(
  generatorBtnBase,
  'bg-emerald-600 text-white border border-emerald-600',
  'hover:bg-emerald-700 hover:!text-white hover:border-emerald-700',
  'focus-visible:ring-emerald-500'
);

/** AMC generate — violet accent. */
export const documentGenerateVioletBtnClass = cn(
  generatorBtnBase,
  'bg-violet-600 text-white border border-violet-600',
  'hover:bg-violet-700 hover:!text-white hover:border-violet-700',
  'focus-visible:ring-violet-500'
);

/** Download, share, drafts — outline. */
export const documentOutlineBtnClass = cn(
  generatorBtnBase,
  'bg-white text-slate-700 border border-slate-300',
  'hover:bg-slate-100 hover:!text-slate-900 hover:border-slate-400',
  'focus-visible:ring-slate-400'
);

/** @deprecated use documentGenerateBtnClass */
export const documentActionBtnClass = documentGenerateBtnClass;

/** @deprecated use documentOutlineBtnClass */
export const documentSecondaryBtnClass = documentOutlineBtnClass;

/** Draft toolbar buttons when stretched in generator header. */
export const documentDraftBtnClass = documentOutlineBtnClass;
