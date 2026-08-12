import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  ensureLeadCatalogLoaded,
  invalidateLeadCatalogCache,
  type LeadCatalog,
  type LeadCostRuleRow,
  type LeadSourceRow,
  type ServiceSubTypeRow,
} from '@/lib/leadCatalog';

type Props = {
  onBack: () => void;
};

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'item';
}

export default function LeadCatalogSettingsPage({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<LeadCatalog | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ensureLeadCatalogLoaded({ force: true, includeInactive: true });
      setCatalog(structuredClone(data));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load lead catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subTypeById = useMemo(() => {
    const m = new Map<string, ServiceSubTypeRow>();
    for (const st of catalog?.subTypes || []) m.set(st.id, st);
    return m;
  }, [catalog?.subTypes]);

  const rulesForSource = useCallback(
    (sourceId: string): LeadCostRuleRow[] =>
      (catalog?.rules || []).filter((r) => r.lead_source_id === sourceId),
    [catalog?.rules]
  );

  const patchSource = (id: string, patch: Partial<LeadSourceRow>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: prev.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  };

  const patchSubType = (id: string, patch: Partial<ServiceSubTypeRow>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subTypes: prev.subTypes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  };

  const setRuleCost = (sourceId: string, subTypeId: string, cost: number) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      const existing = prev.rules.find(
        (r) => r.lead_source_id === sourceId && r.service_sub_type_id === subTypeId
      );
      if (existing) {
        return {
          ...prev,
          rules: prev.rules.map((r) =>
            r.id === existing.id ? { ...r, cost_inr: cost } : r
          ),
        };
      }
      return {
        ...prev,
        rules: [
          ...prev.rules,
          {
            id: `new-${sourceId}-${subTypeId}`,
            lead_source_id: sourceId,
            service_sub_type_id: subTypeId,
            cost_inr: cost,
            priority: 20,
          },
        ],
      };
    });
  };

  const addSource = () => {
    const label = window.prompt('New lead source name');
    if (!label?.trim()) return;
    const slug = slugify(label);
    setCatalog((prev) => {
      if (!prev) return prev;
      const maxSort = Math.max(0, ...prev.sources.map((s) => s.sort_order));
      return {
        ...prev,
        sources: [
          ...prev.sources,
          {
            id: `new-src-${Date.now()}`,
            slug,
            label: label.trim(),
            sort_order: maxSort + 10,
            active: true,
            requires_otp: false,
            allow_custom_text: false,
            default_cost_inr: 0,
            aliases: [],
          },
        ],
      };
    });
  };

  const addSubType = () => {
    const label = window.prompt('New sub-service name');
    if (!label?.trim()) return;
    const slug = slugify(label);
    setCatalog((prev) => {
      if (!prev) return prev;
      const maxSort = Math.max(0, ...prev.subTypes.map((s) => s.sort_order));
      return {
        ...prev,
        subTypes: [
          ...prev.subTypes,
          {
            id: `new-sub-${Date.now()}`,
            slug,
            label: label.trim(),
            sort_order: maxSort + 10,
            active: true,
            allow_custom_text: false,
            aliases: [],
          },
        ],
      };
    });
  };

  const save = async () => {
    if (!catalog) return;
    setSaving(true);
    try {
      const sourceIdMap = new Map<string, string>();
      const subTypeIdMap = new Map<string, string>();

      for (const s of catalog.sources) {
        const row = {
          slug: s.slug,
          label: s.label,
          sort_order: s.sort_order,
          active: s.active,
          requires_otp: s.requires_otp,
          allow_custom_text: s.allow_custom_text,
          default_cost_inr: s.default_cost_inr,
          aliases: s.aliases,
          updated_at: new Date().toISOString(),
        };
        if (s.id.startsWith('new-')) {
          const { data, error } = await supabase.from('lead_sources').insert(row).select('id').single();
          if (error) throw error;
          sourceIdMap.set(s.id, data.id);
          s.id = data.id;
        } else {
          const { error } = await supabase.from('lead_sources').update(row).eq('id', s.id);
          if (error) throw error;
        }
      }

      for (const st of catalog.subTypes) {
        const row = {
          slug: st.slug,
          label: st.label,
          sort_order: st.sort_order,
          active: st.active,
          allow_custom_text: st.allow_custom_text,
          aliases: st.aliases,
          updated_at: new Date().toISOString(),
        };
        if (st.id.startsWith('new-')) {
          const { data, error } = await supabase
            .from('service_sub_types')
            .insert(row)
            .select('id')
            .single();
          if (error) throw error;
          subTypeIdMap.set(st.id, data.id);
          st.id = data.id;
        } else {
          const { error } = await supabase.from('service_sub_types').update(row).eq('id', st.id);
          if (error) throw error;
        }
      }

      const sourceIds = new Set(catalog.sources.map((s) => s.id));
      for (const r of catalog.rules) {
        const leadSourceId = sourceIdMap.get(r.lead_source_id) ?? r.lead_source_id;
        if (!sourceIds.has(leadSourceId)) continue;
        const serviceSubTypeId = r.service_sub_type_id
          ? subTypeIdMap.get(r.service_sub_type_id) ?? r.service_sub_type_id
          : null;
        const row = {
          lead_source_id: leadSourceId,
          service_sub_type_id: serviceSubTypeId,
          cost_inr: r.cost_inr,
          priority: r.priority,
          updated_at: new Date().toISOString(),
        };
        if (r.id.startsWith('new-')) {
          const { error } = await supabase.from('lead_cost_rules').upsert(row, {
            onConflict: 'lead_source_id,service_sub_type_id',
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('lead_cost_rules').update(row).eq('id', r.id);
          if (error) throw error;
        }
      }

      invalidateLeadCatalogCache();
      toast.success('Lead catalog saved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !catalog) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading lead catalog…
      </div>
    );
  }

  const sortedSources = [...catalog.sources].sort((a, b) => a.sort_order - b.sort_order);
  const sortedSubTypes = [...catalog.subTypes].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pb-8 pt-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="min-w-0 flex-1 text-lg font-semibold sm:text-xl">Lead sources & costs</h1>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Cached in the browser for 5 minutes — not fetched on every job field change. Per-job cost
        on existing jobs stays as saved.
      </p>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Lead sources</h2>
          <Button type="button" variant="outline" size="sm" onClick={addSource}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        <div className="space-y-3">
          {sortedSources.map((src) => {
            const expanded = expandedSourceId === src.id;
            const rules = rulesForSource(src.id);
            return (
              <div
                key={src.id}
                className={cn(
                  'rounded-xl border bg-card p-3 shadow-sm sm:p-4',
                  !src.active && 'opacity-60'
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={src.label}
                      onChange={(e) => patchSource(src.id, { label: e.target.value })}
                      className="font-medium"
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Default cost (₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={src.default_cost_inr}
                          onChange={(e) =>
                            patchSource(src.id, {
                              default_cost_inr: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-end gap-4 pt-1">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={src.requires_otp}
                            onCheckedChange={(v) => patchSource(src.id, { requires_otp: v })}
                          />
                          Require OTP
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={src.active}
                            onCheckedChange={(v) => patchSource(src.id, { active: v })}
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setExpandedSourceId(expanded ? null : src.id)}
                  >
                    {expanded ? 'Hide rules' : 'Sub-service costs'}
                  </Button>
                </div>
                {expanded ? (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Override default cost for specific sub-services (e.g. Installation vs
                      Reinstallation).
                    </p>
                    <div className="grid gap-2">
                      {sortedSubTypes.filter((st) => st.active).map((st) => {
                        const rule = rules.find((r) => r.service_sub_type_id === st.id);
                        return (
                          <div
                            key={st.id}
                            className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="text-sm">{st.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">₹</span>
                              <Input
                                type="number"
                                min={0}
                                className="h-8 w-24"
                                value={rule?.cost_inr ?? ''}
                                placeholder={String(src.default_cost_inr)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '') {
                                    setCatalog((prev) => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        rules: prev.rules.filter(
                                          (r) =>
                                            !(
                                              r.lead_source_id === src.id &&
                                              r.service_sub_type_id === st.id
                                            )
                                        ),
                                      };
                                    });
                                    return;
                                  }
                                  setRuleCost(src.id, st.id, Number(v) || 0);
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Sub-services</h2>
          <Button type="button" variant="outline" size="sm" onClick={addSubType}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sortedSubTypes.map((st) => (
            <div
              key={st.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border bg-card px-3 py-2',
                !st.active && 'opacity-60'
              )}
            >
              <Input
                value={st.label}
                onChange={(e) => patchSubType(st.id, { label: e.target.value })}
                className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              <Switch
                checked={st.active}
                onCheckedChange={(v) => patchSubType(st.id, { active: v })}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
