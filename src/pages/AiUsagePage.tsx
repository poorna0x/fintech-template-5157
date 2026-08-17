import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchAiUsage,
  formatTokenCount,
  saveAiModelSelection,
  type AiUsageSnapshot,
} from '@/lib/aiUsage';
import { cn } from '@/lib/utils';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
};

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all',
          pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BreakdownList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {!items.length ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AiUsagePage({ hideHeader, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AiUsageSnapshot | null>(null);
  const [provider, setProvider] = useState('gemini');
  const [model, setModel] = useState('gemini-2.5-flash');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchAiUsage();
    if (!result.ok) {
      setError(result.error);
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setSnapshot(result);
    setProvider(result.config?.provider === 'groq' ? 'groq' : 'gemini');
    setModel(
      result.config?.model ||
        result.selectable.defaults[result.config?.provider || 'gemini'] ||
        'gemini-2.5-flash'
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modelOptions = useMemo(() => {
    const list = snapshot?.selectable.models?.[provider] || [];
    return list.length ? list : [model];
  }, [snapshot, provider, model]);

  useEffect(() => {
    if (!modelOptions.includes(model) && modelOptions[0]) {
      setModel(modelOptions[0]);
    }
  }, [modelOptions, model]);

  const dirty =
    snapshot?.config?.provider !== provider || snapshot?.config?.model !== model;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const result = await saveAiModelSelection({ provider, model });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('AI model updated');
    await load();
  };

  return (
    <div className={cn('space-y-5', hideHeader ? '' : 'container mx-auto max-w-3xl px-4 py-6')}>
      {!hideHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">AI usage & models</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              CRM-tracked limits and manual provider selection
            </p>
          </div>
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          ) : null}
        </div>
      ) : null}

      {snapshot?.dayKey ? (
        <p className="text-xs text-muted-foreground">
          IST day {snapshot.dayKey}
          {snapshot.generatedAt
            ? ` · updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}`
            : ''}
        </p>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading && !snapshot ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI usage…
        </div>
      ) : null}

      {snapshot ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Active model
              </CardTitle>
              <CardDescription>
                Applies to CRM AI, document drafting, and WhatsApp inbox suggestions. API keys stay
                on the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-provider">Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) => {
                      setProvider(value);
                      const next =
                        snapshot.selectable.defaults[value] ||
                        snapshot.selectable.models[value]?.[0] ||
                        '';
                      if (next) setModel(next);
                    }}
                  >
                    <SelectTrigger id="ai-provider" className="h-11">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshot.selectable.providers.map((item) => (
                        <SelectItem
                          key={item}
                          value={item}
                          disabled={
                            (item === 'gemini' && snapshot.config?.geminiConfigured === false) ||
                            (item === 'groq' && snapshot.config?.groqConfigured === false)
                          }
                        >
                          {item === 'gemini' ? 'Google Gemini' : item === 'groq' ? 'Groq' : item}
                          {item === 'gemini' && !snapshot.config?.geminiConfigured
                            ? ' (no key)'
                            : ''}
                          {item === 'groq' && !snapshot.config?.groqConfigured ? ' (no key)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-model">Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger id="ai-model" className="h-11">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Automatic fallback is disabled. Only the selected provider/model is used.
              </p>

              <Button
                type="button"
                className="h-11 w-full touch-manipulation sm:w-auto"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save model
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your CRM daily allowance</CardTitle>
              <CardDescription>
                App-enforced limits for this admin account (not Gemini/Groq free-tier dashboards).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>Requests</span>
                  <span className="tabular-nums text-muted-foreground">
                    {snapshot.myToday.requestCount} / {snapshot.myToday.requestLimit}
                  </span>
                </div>
                <ProgressBar
                  value={snapshot.myToday.requestCount}
                  max={snapshot.myToday.requestLimit}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>Tokens (incl. reserved)</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatTokenCount(
                      snapshot.myToday.inputTokens +
                        snapshot.myToday.outputTokens +
                        snapshot.myToday.reservedTokens
                    )}{' '}
                    / {formatTokenCount(snapshot.myToday.tokenLimit)}
                  </span>
                </div>
                <ProgressBar
                  value={
                    snapshot.myToday.inputTokens +
                    snapshot.myToday.outputTokens +
                    snapshot.myToday.reservedTokens
                  }
                  max={snapshot.myToday.tokenLimit}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today (all admins)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <StatBlock label="Requests" value={String(snapshot.today.requests)} />
                <StatBlock label="OK" value={String(snapshot.today.ok)} />
                <StatBlock
                  label="Tokens in"
                  value={formatTokenCount(snapshot.today.inputTokens)}
                />
                <StatBlock
                  label="Tokens out"
                  value={formatTokenCount(snapshot.today.outputTokens)}
                />
                <StatBlock
                  label="Fallbacks"
                  value={String(snapshot.today.fallbackCount)}
                  hint={snapshot.fallbackTracked ? undefined : 'SQL patch needed'}
                />
                <StatBlock label="Errors" value={String(snapshot.today.error)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">This month</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <StatBlock label="Requests" value={String(snapshot.month.requests)} />
                <StatBlock label="OK" value={String(snapshot.month.ok)} />
                <StatBlock
                  label="Tokens in"
                  value={formatTokenCount(snapshot.month.inputTokens)}
                />
                <StatBlock
                  label="Tokens out"
                  value={formatTokenCount(snapshot.month.outputTokens)}
                />
                <StatBlock label="Fallbacks" value={String(snapshot.month.fallbackCount)} />
                <StatBlock label="Errors" value={String(snapshot.month.error)} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Breakdown</CardTitle>
              <CardDescription>
                {snapshot.fallbackTracked
                  ? 'Served provider/model after automatic fallback.'
                  : 'Claimed primary model until fallback SQL is applied.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <BreakdownList
                title="Models"
                empty="No AI calls this month yet."
                items={snapshot.month.byModel.map((item) => ({
                  label: item.model,
                  count: item.count,
                }))}
              />
              <BreakdownList
                title="Operations"
                empty="No operations recorded."
                items={snapshot.month.byOperation.map((item) => ({
                  label: item.operation,
                  count: item.count,
                }))}
              />
              <BreakdownList
                title="Errors"
                empty="No errors this month."
                items={snapshot.month.byErrorCategory.map((item) => ({
                  label: item.category,
                  count: item.count,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Provider dashboards</CardTitle>
              <CardDescription>
                Free-tier remaining quotas live with the provider, not in CRM.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-11 touch-manipulation">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  Gemini console
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11 touch-manipulation">
                <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                  Groq console
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          {snapshot.notes?.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {snapshot.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
