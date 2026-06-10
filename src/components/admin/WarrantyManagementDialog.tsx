import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ShieldCheck,
  Search,
  Loader2,
  Plus,
  Trash2,
  Package,
  ChevronLeft,
  MapPin,
  Pencil,
  X,
  Wrench,
  Boxes,
  Tags,
  BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import {
  WARRANTY_CATEGORIES,
  WARRANTY_NOTE_PRESETS,
  MANUAL_WARRANTY_NOTE_PRESETS,
  categoryDef,
  guessCategory,
  warrantyStatus,
  formatWarrantyDate,
  addDays,
  durationToDays,
  deriveDuration,
  todayDateOnly,
  DEFAULT_WARRANTY_MONTHS,
  type WarrantyCategory,
  type DurationUnit,
} from '@/lib/warranty';

interface WarrantyManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CustomerPick {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  model: string;
  brand: string;
  visible_address: string;
}

interface SelectedCustomer extends CustomerPick {
  addressText: string;
}

interface JobRow {
  id: string;
  job_number: string;
  status: string;
  service_type: string;
  scheduled_date: string | null;
  completed_at: string | null;
}

interface InventoryRow {
  id: string;
  product_name: string;
  code: string | null;
}

interface ExistingItem {
  id: string;
  category: string;
  label: string;
  months: number;
  duration_days?: number;
  start_date: string;
  end_date: string;
  covered?: boolean;
  inventory_id?: string | null;
  job_part_id?: string | null;
}

interface ExistingWarranty {
  id: string;
  start_date: string;
  end_date: string;
  default_months?: number;
  notes: string | null;
  items: ExistingItem[];
}

interface AmcInfo {
  active: boolean;
  end_date: string | null;
}

// A draft item being added/edited (from a job part, inventory, or manual category).
interface DraftItem {
  key: string;
  category: WarrantyCategory;
  label: string;
  durValue: number;
  durUnit: DurationUnit;
  include: boolean;
  covered: boolean;
  inventory_id: string | null;
  job_part_id: string | null;
}

type FormMode = 'closed' | 'add' | 'edit';

function buildAddressText(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const a = address as Record<string, string>;
  return [a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Split a stored notes string into which presets are active + the remaining free text.
function splitNotes(stored: string | null): { presets: Set<string>; custom: string } {
  const presets = new Set<string>();
  let rest = stored || '';
  for (const p of WARRANTY_NOTE_PRESETS) {
    if (rest.includes(p.text)) {
      presets.add(p.id);
      rest = rest.replace(p.text, '');
    }
  }
  return { presets, custom: rest.replace(/\n{2,}/g, '\n').trim() };
}

function joinNotes(presetIds: Set<string>, custom: string): string {
  const parts: string[] = [];
  for (const p of WARRANTY_NOTE_PRESETS) {
    if (presetIds.has(p.id)) parts.push(p.text);
  }
  if (custom.trim()) parts.push(custom.trim());
  return parts.join('\n\n');
}

export default function WarrantyManagementDialog({
  open,
  onOpenChange,
}: WarrantyManagementDialogProps) {
  // ---- customer search ----
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // ---- selected customer context ----
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [existing, setExisting] = useState<ExistingWarranty[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [amc, setAmc] = useState<AmcInfo | null>(null);

  // ---- add/edit form ----
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayDateOnly());
  const [defaultValue, setDefaultValue] = useState(DEFAULT_WARRANTY_MONTHS);
  const [defaultUnit, setDefaultUnit] = useState<DurationUnit>('months');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [customNotes, setCustomNotes] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [loadingParts, setLoadingParts] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- inventory spare-part picker ----
  const [invOpen, setInvOpen] = useState(false);
  const [invLoaded, setInvLoaded] = useState(false);
  const [invList, setInvList] = useState<InventoryRow[]>([]);
  const [invQuery, setInvQuery] = useState('');

  const resetForm = useCallback(() => {
    setFormMode('closed');
    setEditingId(null);
    setStartDate(todayDateOnly());
    setDefaultValue(DEFAULT_WARRANTY_MONTHS);
    setDefaultUnit('months');
    setItems([]);
    setSelectedPresets(new Set());
    setCustomNotes('');
    setSelectedJobId('');
    setInvOpen(false);
    setInvQuery('');
  }, []);

  const resetAll = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
    setSearched(false);
    setCustomer(null);
    setLoadingCustomer(false);
    setExisting([]);
    setJobs([]);
    setAmc(null);
    setSaving(false);
    setInvLoaded(false);
    setInvList([]);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!open) resetAll();
  }, [open, resetAll]);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    try {
      const { data, error } = await db.customers.searchSlim(trimmed, 8);
      if (error) throw error;
      const rows = (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          customer_id: String(row.customer_id ?? ''),
          full_name: String(row.full_name ?? ''),
          phone: String(row.phone ?? ''),
          model: String(row.model ?? ''),
          brand: String(row.brand ?? ''),
          visible_address: String(row.visible_address ?? ''),
        };
      });
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [query]);

  const reloadExisting = useCallback(async (customerId: string) => {
    const { data } = await db.warranties.getByCustomer(customerId);
    setExisting((data ?? []) as unknown as ExistingWarranty[]);
  }, []);

  const loadCustomer = useCallback(async (pick: CustomerPick) => {
    setLoadingCustomer(true);
    setResults([]);
    setSearched(false);
    setQuery('');
    resetForm();
    try {
      const [addrRes, warrantiesRes, jobsRes, amcRes] = await Promise.all([
        db.customers.getAddressById(pick.id),
        db.warranties.getByCustomer(pick.id),
        db.jobs.getByCustomerIdForPicker(pick.id),
        db.amcContracts.getActiveSlimByCustomerId(pick.id),
      ]);

      const addrRow = (addrRes.data ?? {}) as Record<string, unknown>;
      setCustomer({
        ...pick,
        addressText: buildAddressText(addrRow.address) || pick.visible_address,
      });

      if (warrantiesRes.error) {
        const msg = warrantiesRes.error.message || '';
        if (/warranties|warranty_items|does not exist|relation|column/i.test(msg)) {
          toast.error('Warranty tables missing/outdated. Run scripts/add-warranties.sql in Supabase.');
        }
        setExisting([]);
      } else {
        setExisting((warrantiesRes.data ?? []) as unknown as ExistingWarranty[]);
      }

      setJobs(((jobsRes.data ?? []) as unknown as JobRow[]) || []);

      const amcRow = amcRes.data as Record<string, unknown> | null;
      if (amcRow && amcRow.id) {
        const end = (amcRow.end_date as string | null) ?? null;
        setAmc({ active: !end || end >= todayDateOnly(), end_date: end });
      } else {
        setAmc(null);
      }
    } catch {
      toast.error('Could not load customer warranty info.');
    } finally {
      setLoadingCustomer(false);
    }
  }, [resetForm]);

  // ---- form openers ----
  const openAddForm = useCallback(() => {
    resetForm();
    setFormMode('add');
  }, [resetForm]);

  const openEditForm = useCallback((w: ExistingWarranty) => {
    setFormMode('edit');
    setEditingId(w.id);
    setStartDate(w.start_date);
    setDefaultValue(w.default_months ?? DEFAULT_WARRANTY_MONTHS);
    setDefaultUnit('months');
    const { presets, custom } = splitNotes(w.notes);
    setSelectedPresets(presets);
    setCustomNotes(custom);
    setSelectedJobId('');
    setItems(
      w.items.map((it) => {
        const days = it.duration_days ?? (it.months ?? DEFAULT_WARRANTY_MONTHS) * 30;
        const { value, unit } = deriveDuration(days);
        return {
          key: `existing-${it.id}`,
          category: (it.category as WarrantyCategory) || 'OTHER',
          label: it.label,
          durValue: value,
          durUnit: unit,
          include: true,
          covered: it.covered !== false,
          inventory_id: it.inventory_id ?? null,
          job_part_id: it.job_part_id ?? null,
        };
      })
    );
  }, []);

  // ---- add items from a job ----
  const handleSelectJob = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId);
      setItems((prev) => prev.filter((it) => it.job_part_id === null));
      if (!jobId) return;
      // Default the warranty start to the job's completion date (fall back to scheduled date).
      const job = jobs.find((j) => j.id === jobId);
      const startSource = job?.completed_at || job?.scheduled_date;
      if (startSource) setStartDate(String(startSource).slice(0, 10));
      setLoadingParts(true);
      try {
        const { data, error } = await db.jobPartsUsed.getByJob(jobId);
        if (error) throw error;
        const partRows = (data ?? []) as Array<Record<string, unknown>>;
        const drafts: DraftItem[] = partRows.map((p) => {
          const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
          const invObj = (inv ?? {}) as Record<string, unknown>;
          const name = String(invObj.product_name ?? p.custom_name ?? 'Part');
          const qty = Number(p.quantity_used ?? 1);
          return {
            key: `part-${String(p.id)}`,
            category: guessCategory(name),
            label: qty > 1 ? `${name} ×${qty}` : name,
            durValue: defaultValue,
            durUnit: defaultUnit,
            include: true,
            covered: true,
            inventory_id: (invObj.id as string) ?? (p.inventory_id as string) ?? null,
            job_part_id: String(p.id),
          };
        });
        setItems((prev) => [...drafts, ...prev.filter((it) => it.job_part_id === null)]);
        if (drafts.length === 0) toast.info('No parts recorded on this job.');
      } catch {
        toast.error('Could not load parts for this job.');
      } finally {
        setLoadingParts(false);
      }
    },
    [defaultValue, defaultUnit, jobs]
  );

  // ---- add items from inventory (spare parts) ----
  const openInventory = useCallback(async () => {
    setInvOpen((v) => !v);
    if (invLoaded) return;
    try {
      const { data, error } = await db.inventory.getAll();
      if (error) throw error;
      setInvList(
        ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          product_name: String(r.product_name ?? ''),
          code: (r.code as string | null) ?? null,
        }))
      );
      setInvLoaded(true);
    } catch {
      toast.error('Could not load inventory.');
    }
  }, [invLoaded]);

  const addInventoryItem = useCallback(
    (row: InventoryRow) => {
      setItems((prev) => [
        ...prev,
        {
          key: newKey('inv'),
          category: guessCategory(row.product_name),
          label: row.product_name,
          durValue: defaultValue,
          durUnit: defaultUnit,
          include: true,
          covered: true,
          inventory_id: row.id,
          job_part_id: null,
        },
      ]);
      setInvQuery('');
    },
    [defaultValue, defaultUnit]
  );

  const addManualItem = useCallback(
    (category: WarrantyCategory) => {
      setItems((prev) => [
        ...prev,
        {
          key: newKey('manual'),
          category,
          label: categoryDef(category).label,
          durValue: defaultValue,
          durUnit: defaultUnit,
          include: true,
          covered: true,
          inventory_id: null,
          job_part_id: null,
        },
      ]);
    },
    [defaultValue, defaultUnit]
  );

  const updateItem = useCallback((key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const togglePreset = useCallback((id: string) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const includedItems = useMemo(() => items.filter((it) => it.include), [items]);

  const filteredInventory = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    const base = q
      ? invList.filter(
          (r) =>
            r.product_name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q)
        )
      : invList;
    return base.slice(0, 30);
  }, [invList, invQuery]);

  // ---- save (create or update) ----
  const handleSave = useCallback(async () => {
    if (!customer) return;
    const cleaned = includedItems
      .map((it) => ({ ...it, label: it.label.trim() }))
      .filter((it) => it.label.length > 0);
    if (cleaned.length === 0) {
      toast.error('Add at least one item (a part, spare part, or coverage category).');
      return;
    }

    setSaving(true);
    try {
      const itemRows = cleaned.map((it) => {
        const days = it.covered ? durationToDays(it.durValue, it.durUnit) : 0;
        return {
          category: it.category,
          label: it.label,
          inventory_id: it.inventory_id,
          job_part_id: it.job_part_id,
          months: it.covered && it.durUnit === 'months' ? Math.min(120, it.durValue) : 0,
          duration_days: days,
          start_date: startDate,
          end_date: it.covered ? addDays(startDate, days) : startDate,
          covered: it.covered,
        };
      });
      const coveredEnds = itemRows.filter((it) => it.covered).map((it) => it.end_date);
      const headerEnd = coveredEnds.reduce(
        (max, end) => (end > max ? end : max),
        coveredEnds.length > 0
          ? coveredEnds[0]
          : addDays(startDate, durationToDays(defaultValue, defaultUnit))
      );
      const notes = joinNotes(selectedPresets, customNotes) || null;
      const defaultMonthsForHeader =
        defaultUnit === 'months'
          ? defaultValue
          : Math.max(0, Math.round(durationToDays(defaultValue, defaultUnit) / 30));

      if (formMode === 'edit' && editingId) {
        const { error } = await db.warranties.update(
          editingId,
          { start_date: startDate, end_date: headerEnd, default_months: defaultMonthsForHeader, notes },
          itemRows
        );
        if (error) {
          toast.error(error.message || 'Could not update warranty.');
          return;
        }
        toast.success('Warranty updated.');
      } else {
        const { error } = await db.warranties.create(
          {
            customer_id: customer.id,
            job_id: selectedJobId || null,
            start_date: startDate,
            end_date: headerEnd,
            default_months: defaultMonthsForHeader,
            notes,
          },
          itemRows
        );
        if (error) {
          toast.error(error.message || 'Could not save warranty.');
          return;
        }
        toast.success('Warranty added.');
      }

      await reloadExisting(customer.id);
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save warranty.');
    } finally {
      setSaving(false);
    }
  }, [
    customer,
    includedItems,
    defaultValue,
    defaultUnit,
    startDate,
    selectedJobId,
    selectedPresets,
    customNotes,
    formMode,
    editingId,
    reloadExisting,
    resetForm,
  ]);

  const handleDeleteWarranty = useCallback(
    async (id: string) => {
      const { error } = await db.warranties.delete(id);
      if (error) {
        toast.error(error.message || 'Could not delete warranty.');
        return;
      }
      setExisting((prev) => prev.filter((w) => w.id !== id));
      if (editingId === id) resetForm();
      toast.success('Warranty deleted.');
    },
    [editingId, resetForm]
  );

  const canSearch = query.trim().length >= 2 && !searching;

  return (
    <Dialog open={open} onOpenChange={(next) => (!saving ? onOpenChange(next) : undefined)}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 text-sky-600" />
            Warranty management
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {customer
              ? 'Add or edit warranties. Pull parts from a job, add spare parts from inventory, or cover by category. Customers self-check at /warranty.'
              : 'Search a customer to view and manage their warranties.'}
          </DialogDescription>
        </DialogHeader>

        {/* ===== Step 1: search / select customer ===== */}
        {!customer ? (
          <div className="space-y-3 py-1">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearched(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSearch) {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  placeholder="Search name, phone, or ID"
                  className="pl-9"
                />
              </div>
              <Button type="button" variant="secondary" disabled={!canSearch} onClick={() => void runSearch()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>
            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-xs text-muted-foreground">Type at least 2 characters, then Search.</p>
            )}
            {searched && !searching && results.length === 0 && (
              <p className="text-xs text-muted-foreground">No customers found.</p>
            )}
            {results.length > 0 && (
              <ul className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 text-sm active:bg-muted"
                      onClick={() => void loadCustomer(row)}
                    >
                      <span className="font-medium">{row.full_name}</span>
                      <span className="text-muted-foreground">
                        {' '}· {row.customer_id} · {row.phone}
                      </span>
                      {(row.brand || row.model) && (
                        <span className="block text-xs text-muted-foreground">
                          {[row.brand, row.model].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* ===== Customer summary ===== */}
            <section className="rounded-lg border p-3 bg-muted/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{customer.full_name}</p>
                    {amc?.active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        <BadgeCheck className="h-3 w-3" /> AMC
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {customer.customer_id} · {customer.phone}
                  </p>
                  {customer.addressText && (
                    <p className="text-sm text-muted-foreground flex items-start gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="min-w-0">{customer.addressText}</span>
                    </p>
                  )}
                  {(customer.brand || customer.model) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Unit: {[customer.brand, customer.model].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {amc?.active && (
                    <p className="text-xs text-indigo-700 mt-1">
                      Active AMC{amc.end_date ? ` · valid till ${formatWarrantyDate(amc.end_date)}` : ''} — covered as agreed in the AMC agreement.
                    </p>
                  )}
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setCustomer(null)}>
                  <ChevronLeft className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Change</span>
                </Button>
              </div>
            </section>

            {loadingCustomer ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : (
              <>
                {/* ===== Existing warranties ===== */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Existing warranties</p>
                    {formMode === 'closed' && (
                      <Button type="button" size="sm" onClick={openAddForm}>
                        <Plus className="h-4 w-4 mr-1" /> Add warranty
                      </Button>
                    )}
                  </div>

                  {existing.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No warranties yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {existing.map((w) => {
                        const coveredItems = w.items.filter((it) => it.covered !== false);
                        const end =
                          coveredItems.length > 0
                            ? coveredItems.reduce(
                                (max, it) => (it.end_date > max ? it.end_date : max),
                                coveredItems[0].end_date
                              )
                            : w.end_date;
                        const st = warrantyStatus(end);
                        return (
                          <div key={w.id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.toneClass}`}>
                                  {st.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  From {formatWarrantyDate(w.start_date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="Edit warranty"
                                  onClick={() => openEditForm(w)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  title="Delete warranty"
                                  onClick={() => void handleDeleteWarranty(w.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            {w.items.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {w.items.map((it) => {
                                  const cat = categoryDef(it.category);
                                  const ist = warrantyStatus(it.end_date);
                                  const notCovered = it.covered === false;
                                  const showBadge =
                                    it.label.trim().toLowerCase() !== cat.label.toLowerCase();
                                  return (
                                    <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                                      <span className="flex items-center gap-2 min-w-0">
                                        {showBadge && (
                                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase shrink-0 ${cat.badgeClass}`}>
                                            {cat.label}
                                          </span>
                                        )}
                                        <span className={`truncate ${notCovered ? 'text-muted-foreground line-through' : ''}`}>
                                          {it.label}
                                        </span>
                                      </span>
                                      <span className="text-xs shrink-0">
                                        {notCovered ? (
                                          <span className="text-red-600 font-medium">Not covered</span>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            {formatWarrantyDate(it.end_date)} · {ist.active ? 'Active' : 'Expired'}
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {w.notes && (
                              <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{w.notes}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ===== Add / Edit form ===== */}
                {formMode !== 'closed' && (
                  <section className="space-y-4 rounded-lg border-2 border-sky-200 dark:border-sky-900 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {formMode === 'edit' ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {formMode === 'edit' ? 'Edit warranty' : 'Add warranty'}
                      </p>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={resetForm}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="warranty-start" className="text-xs">Start date</Label>
                        <Input
                          id="warranty-start"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="warranty-dur" className="text-xs">Default duration</Label>
                        <div className="flex gap-2">
                          <Input
                            id="warranty-dur"
                            type="number"
                            min={0}
                            max={3650}
                            value={defaultValue}
                            onChange={(e) => setDefaultValue(Math.max(0, Math.min(3650, Number(e.target.value) || 0)))}
                            className="flex-1"
                          />
                          <Select value={defaultUnit} onValueChange={(v) => setDefaultUnit(v as DurationUnit)}>
                            <SelectTrigger className="w-[110px] shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="months">Months</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {defaultUnit === 'months' && (
                          <p className="text-[10px] text-muted-foreground">
                            {defaultValue} month{defaultValue === 1 ? '' : 's'} = {durationToDays(defaultValue, 'months')} days
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Coverage sources */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Add coverage
                      </p>

                      {/* From a job */}
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5" /> From a job's parts
                        </Label>
                        <Select value={selectedJobId} onValueChange={(v) => void handleSelectJob(v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a job to pull its parts" />
                          </SelectTrigger>
                          <SelectContent>
                            {jobs.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No jobs found</div>
                            ) : (
                              jobs.map((j) => (
                                <SelectItem key={j.id} value={j.id}>
                                  {j.job_number} · {j.service_type} · {j.status}
                                  {j.scheduled_date ? ` · ${formatWarrantyDate(j.scheduled_date)}` : ''}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {loadingParts && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading parts…
                          </p>
                        )}
                      </div>

                      {/* From inventory (spare parts) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Boxes className="h-3.5 w-3.5" /> Spare part from inventory
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void openInventory()}>
                            {invOpen ? 'Hide' : 'Browse'}
                          </Button>
                        </div>
                        {invOpen && (
                          <div className="rounded-md border p-2 space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={invQuery}
                                onChange={(e) => setInvQuery(e.target.value)}
                                placeholder="Search spare parts…"
                                className="pl-9 h-9"
                              />
                            </div>
                            {!invLoaded ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading inventory…
                              </p>
                            ) : filteredInventory.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No matching parts.</p>
                            ) : (
                              <ul className="max-h-40 overflow-y-auto divide-y">
                                {filteredInventory.map((row) => (
                                  <li key={row.id}>
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1.5 hover:bg-muted/60 text-sm rounded"
                                      onClick={() => addInventoryItem(row)}
                                    >
                                      <Plus className="h-3 w-3 inline mr-1 text-sky-600" />
                                      {row.product_name}
                                      {row.code && <span className="text-muted-foreground"> · {row.code}</span>}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      {/* By category */}
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Tags className="h-3.5 w-3.5" /> By category
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {WARRANTY_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => (
                            <Button
                              key={c.value}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => addManualItem(c.value)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {c.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Draft items */}
                    {items.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Covered items ({includedItems.length})
                        </p>
                        {items.map((it) => (
                          <div key={it.key} className="rounded-md border p-2 space-y-2 bg-card">
                            {/* Row 1: include + label + delete */}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={it.include}
                                onCheckedChange={(c) => updateItem(it.key, { include: c === true })}
                              />
                              {it.job_part_id ? (
                                <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : it.inventory_id ? (
                                <Boxes className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <Tags className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <Input
                                value={it.label}
                                onChange={(e) => updateItem(it.key, { label: e.target.value })}
                                className="h-8 flex-1 min-w-0"
                                placeholder="Item name"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 shrink-0"
                                onClick={() => removeItem(it.key)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {/* Row 2: category + months/covered */}
                            <div className="flex items-center gap-2 flex-wrap pl-6">
                              <Select
                                value={it.category}
                                onValueChange={(v) => updateItem(it.key, { category: v as WarrantyCategory })}
                              >
                                <SelectTrigger className="h-8 w-[130px] shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {WARRANTY_CATEGORIES.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {it.covered ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={3650}
                                    value={it.durValue}
                                    onChange={(e) =>
                                      updateItem(it.key, {
                                        durValue: Math.max(0, Math.min(3650, Number(e.target.value) || 0)),
                                      })
                                    }
                                    className="h-8 w-16 shrink-0"
                                    title="Duration"
                                  />
                                  <Select
                                    value={it.durUnit}
                                    onValueChange={(v) => updateItem(it.key, { durUnit: v as DurationUnit })}
                                  >
                                    <SelectTrigger className="h-8 w-[92px] shrink-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="months">Months</SelectItem>
                                      <SelectItem value="days">Days</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                    → {formatWarrantyDate(addDays(startDate, durationToDays(it.durValue, it.durUnit)))}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-red-600">No warranty</span>
                              )}

                              <Button
                                type="button"
                                variant={it.covered ? 'outline' : 'secondary'}
                                size="sm"
                                className="h-8 px-2 text-[10px] ml-auto"
                                onClick={() => updateItem(it.key, { covered: !it.covered })}
                              >
                                {it.covered ? 'Mark no warranty' : 'Mark covered'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes presets */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Notes & terms
                      </p>
                      {amc?.active && (
                        <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 p-2">
                          <BadgeCheck className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-indigo-800 dark:text-indigo-300">
                            <span className="font-medium">AMC coverage is shown automatically.</span> This
                            customer's active AMC appears on the warranty page as agreed in the AMC agreement —
                            no need to add it here.
                          </span>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {MANUAL_WARRANTY_NOTE_PRESETS.map((p) => (
                          <label
                            key={p.id}
                            className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40"
                          >
                            <Checkbox
                              checked={selectedPresets.has(p.id)}
                              onCheckedChange={() => togglePreset(p.id)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="text-sm font-medium block">{p.label}</span>
                              <span className="text-xs text-muted-foreground block">{p.text}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <Textarea
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="Additional notes (optional)…"
                        rows={2}
                      />
                    </div>

                    {/* Save */}
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                      <Button type="button" variant="outline" className="sm:flex-1" disabled={saving} onClick={resetForm}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="sm:flex-1"
                        disabled={saving || includedItems.length === 0}
                        onClick={() => void handleSave()}
                      >
                        {saving ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                        ) : (
                          <><ShieldCheck className="h-4 w-4 mr-2" /> {formMode === 'edit' ? 'Update warranty' : 'Save warranty'}</>
                        )}
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
