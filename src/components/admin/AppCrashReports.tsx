import { useCallback, useEffect, useState } from 'react';
import { Bug, RefreshCw, Trash2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { formatDeviceLastSeen } from '@/lib/deviceTracker';
import {
  type AppCrashRow,
  deleteAppCrashReport,
  deleteAppCrashReports,
  loadAppCrashReports,
  loadCrashStack,
  readCrashCache,
  shortExceptionName,
  writeCrashCache,
} from '@/lib/appCrashReports';

function CrashCard({
  crash,
  onDelete,
}: {
  crash: AppCrashRow;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [stack, setStack] = useState<string | null>(null);
  const [loadingStack, setLoadingStack] = useState(false);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    // The trace is only fetched for the report actually opened.
    if (next && stack === null && !loadingStack) {
      setLoadingStack(true);
      try {
        setStack(await loadCrashStack(crash.id));
      } catch {
        toast.error('Could not load the stack trace');
        setStack('');
      } finally {
        setLoadingStack(false);
      }
    }
  };

  const copyStack = async () => {
    try {
      await navigator.clipboard.writeText(stack || '');
      toast.success('Stack trace copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="rounded-md border border-border dark:border-gray-700 overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm break-all">
              {crash.kind === 'crash' ? shortExceptionName(crash.exception) : crash.exception}
            </span>
            {crash.kind === 'crash' ? (
              <Badge variant="outline" className="text-[10px] text-red-700 border-red-300 px-1.5 py-0">
                Crash
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300 px-1.5 py-0">
                Warning
              </Badge>
            )}
            {crash.occurrences > 1 ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {crash.occurrences}×
              </Badge>
            ) : null}
          </div>
          {crash.message && crash.message !== 'null' ? (
            <p className="text-xs text-muted-foreground break-words line-clamp-2">{crash.message}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{crash.ownerLabel}</span>
            {crash.device_model ? (
              <>
                <span>·</span>
                <span>{crash.device_model}</span>
              </>
            ) : null}
            {crash.app_version ? (
              <>
                <span>·</span>
                <span>v{crash.app_version}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{formatDeviceLastSeen(crash.last_seen_at)}</span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 h-7 w-7 p-0 shrink-0"
          onClick={onDelete}
          aria-label="Delete crash report"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
        onClick={() => void toggle()}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {crash.kind === 'crash' ? 'Stack trace' : 'Detail'}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded ? (
        <div className="border-t border-border bg-muted/30 p-2 space-y-2">
          {loadingStack ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              <pre className="text-[10px] leading-snug font-mono whitespace-pre overflow-x-auto max-h-48 overflow-y-auto">
                {stack || 'No trace stored.'}
              </pre>
              {stack ? (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void copyStack()}>
                  <Copy className="w-3 h-3 mr-1.5" />
                  Copy
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Settings section — crashes the Android apps uploaded after they died. */
export function AppCrashReports() {
  const [crashes, setCrashes] = useState<AppCrashRow[]>(() => readCrashCache() ?? []);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force) {
      const cached = readCrashCache();
      if (cached) {
        setCrashes(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const rows = await loadAppCrashReports();
      setCrashes(rows);
      writeCrashCache(rows);
    } catch (err) {
      console.error('[app-crashes] load failed', err);
      toast.error('Could not load app health reports. Run scripts/add-app-crash-reports.sql in Supabase if this is new.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeOne = async (id: string) => {
    try {
      await deleteAppCrashReport(id);
      setCrashes((prev) => {
        const next = prev.filter((c) => c.id !== id);
        writeCrashCache(next);
        return next;
      });
    } catch (err) {
      console.error('[app-crashes] delete failed', err);
      toast.error('Could not delete');
    }
  };

  const crashCount = crashes.filter((c) => c.kind === 'crash').length;
  const warningCount = crashes.length - crashCount;

  const clearAll = async () => {
    try {
      await deleteAppCrashReports(crashes.map((c) => c.id));
      setCrashes([]);
      writeCrashCache([]);
      toast.success('Reports cleared');
    } catch (err) {
      console.error('[app-crashes] clear failed', err);
      toast.error('Could not clear');
    } finally {
      setConfirmClear(false);
    }
  };

  return (
    <>
      <Card id="section-app-crashes" className="scroll-mt-24">
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Bug className="w-4 h-4 shrink-0" />
                App health
                {crashCount > 0 ? (
                  <Badge variant="outline" className="text-[10px] text-red-700 border-red-300 px-1.5 py-0">
                    {crashCount} crash{crashCount === 1 ? '' : 'es'}
                  </Badge>
                ) : null}
                {warningCount > 0 ? (
                  <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300 px-1.5 py-0">
                    {warningCount} warning{warningCount === 1 ? '' : 's'}
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Phone crashes and silent failures (location blocked, permission off). Needs latest APK.
              </CardDescription>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {crashes.length > 0 ? (
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setConfirmClear(true)}>
                  <Trash2 className="w-3.5 h-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void refresh({ force: true })}
                disabled={loading}
              >
                <RefreshCw className={`w-3.5 h-3.5 sm:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2 space-y-2">
          {loading && crashes.length === 0 ? (
            <div className="text-center py-3 text-muted-foreground text-xs">Loading…</div>
          ) : crashes.length === 0 ? (
            <div className="text-center py-3 text-muted-foreground text-xs">
              Nothing reported — phones healthy.
            </div>
          ) : (
            <div className="space-y-2">
              {crashes.map((crash) => (
                <CrashCard key={crash.id} crash={crash} onDelete={() => void removeOne(crash.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all reports?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {crashes.length} report{crashes.length === 1 ? '' : 's'}. New crashes and warnings will still be reported.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void clearAll()}>
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
