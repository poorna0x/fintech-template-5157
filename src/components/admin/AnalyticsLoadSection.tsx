import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type AnalyticsLoadSectionProps = {
  id?: string;
  title: string;
  description?: string;
  icon: ReactNode;
  loadLabel: string;
  loadingLabel: string;
  onLoad: () => void;
  loading?: boolean;
  loaded?: boolean;
  /** Keep load/reload visible after data is shown (e.g. conversions). */
  keepActionVisible?: boolean;
  emptyHint?: string;
  children?: ReactNode;
};

function ActionIcon({ icon, refresh }: { icon: ReactNode; refresh?: boolean }) {
  if (refresh) return <RefreshCw className="w-4 h-4 shrink-0" />;
  return <span className="inline-flex shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>;
}

export function AnalyticsLoadSection({
  id,
  title,
  description,
  icon,
  loadLabel,
  loadingLabel,
  onLoad,
  loading = false,
  loaded = false,
  keepActionVisible = false,
  emptyHint,
  children,
}: AnalyticsLoadSectionProps) {
  const showReload = loaded && keepActionVisible;
  const showRefresh = loaded && !keepActionVisible;
  const showEmptyState = !loaded && !loading;
  const actionLabel = loading ? loadingLabel : showReload ? 'Reload' : loadLabel;

  const actionButton = (
    <Button
      type="button"
      onClick={onLoad}
      disabled={loading}
      variant={showReload ? 'outline' : 'default'}
      className={cn(
        'touch-manipulation gap-2 font-medium',
        'w-full h-11 sm:w-auto sm:h-9 sm:shrink-0 sm:px-4 sm:shadow-sm',
        showReload && 'sm:min-w-[7.5rem]'
      )}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <ActionIcon icon={icon} refresh={showReload} />
          <span>{actionLabel}</span>
        </>
      )}
    </Button>
  );

  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onLoad}
      disabled={loading}
      className="hidden sm:inline-flex shrink-0 gap-1.5 h-9 px-3"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4 shrink-0" />
      )}
      Refresh
    </Button>
  );

  return (
    <Card id={id}>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="space-y-1.5 flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <span className="flex shrink-0 text-foreground [&>svg]:w-5 [&>svg]:h-5">{icon}</span>
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="text-sm leading-relaxed max-w-2xl">{description}</CardDescription>
            ) : null}
          </div>
          {!loaded || keepActionVisible ? (
            <div className="hidden sm:block shrink-0">{actionButton}</div>
          ) : showRefresh ? (
            refreshButton
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
        {(!loaded || keepActionVisible) && <div className="sm:hidden">{actionButton}</div>}

        {showEmptyState ? (
          <div className="hidden sm:flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-gradient-to-b from-muted/25 to-muted/5 px-6 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground [&>svg]:w-5 [&>svg]:h-5">
              {icon}
            </div>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              {emptyHint ?? `Load to view ${title.toLowerCase()} for the selected period.`}
            </p>
          </div>
        ) : null}

        {loaded ? children : null}
      </CardContent>
    </Card>
  );
}
