import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Search,
  Phone,
  Copy,
  ExternalLink,
  Map,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  advancedCustomerSearch,
  type AdvancedSearchFilters,
  type AdvancedSearchRow,
} from '@/lib/advancedCustomerSearch';
import { db } from '@/lib/supabase';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import type { Customer, Technician } from '@/types';

interface AdvancedCustomerSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FILTERS: AdvancedSearchFilters = {
  freeText: '',
  brandContains: '',
  brandSource: 'either',
  locationContains: '',
  serviceType: '',
  status: '',
  hasPrefilter: '',
  hasGoogleReview: '',
  hasAMC: '',
  lastServiceFrom: '',
  lastServiceTo: '',
  createdSinceFrom: '',
  createdSinceTo: '',
  serviceSubType: '',
  leadSource: '',
  completedByTechnicianId: '',
  billMin: '',
  billMax: '',
  sort: 'last_service_desc',
  limit: 200,
};

/** Match the lead-source values used in NewJob / AddCustomer flows. */
const LEAD_SOURCES = [
  'Website',
  'Direct call',
  'Google-Leads',
  'RO care india',
  'Home Triangle',
  'Home Triangle-Srujan',
  'Home Triangle-3',
  'Local Ramu',
  'Other',
];

/** Match the service-sub-type values used in NewJob / AddCustomer flows. */
const SERVICE_SUB_TYPES = [
  'Service',
  'Installation',
  'Reinstallation',
  'Return Complaint',
  'AMC Service',
  'New Purifier Installation',
  'Un-Installation',
  'Repair',
  'Maintenance',
  'Replacement',
  'Inspection',
];

const formatLocation = (row: AdvancedSearchRow): string => {
  if (row.visible_address && row.visible_address.trim()) return row.visible_address.trim();
  const a = row.address;
  if (a) {
    const parts = [a.area, a.city].filter(Boolean) as string[];
    if (parts.length > 0) return parts.join(', ');
    if (a.street) return a.street.length > 50 ? a.street.slice(0, 50) + '…' : a.street;
  }
  return '—';
};

const formatLastService = (raw: string | null): string => {
  if (!raw) return 'Never serviced';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
};

type TechOption = { id: string; label: string };
type TechRow = {
  id: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  employee_id?: string;
  employeeId?: string;
};

/** Build a Customer-shaped object the existing CustomerReportDialog can consume from a slim row. */
function rowToReportCustomer(row: AdvancedSearchRow): Customer {
  return {
    id: row.id,
    customer_id: row.customer_id ?? '',
    customerId: row.customer_id ?? '',
    full_name: row.full_name ?? '',
    fullName: row.full_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    visible_address: row.visible_address ?? '',
    address: row.address ?? undefined,
    service_type: row.service_type ?? '',
    brand: row.brand ?? '',
    model: row.model ?? '',
    raw_water_tds: row.raw_water_tds ?? 0,
    has_prefilter: row.has_prefilter ?? null,
    last_service_date: row.last_service_date ?? null,
  } as unknown as Customer;
}

const AdvancedCustomerSearchDialog: React.FC<AdvancedCustomerSearchDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AdvancedSearchFilters>(EMPTY_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<AdvancedSearchRow[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [technicianRows, setTechnicianRows] = useState<TechRow[]>([]);
  const [techsLoaded, setTechsLoaded] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [reportTechniciansLoading, setReportTechniciansLoading] = useState(false);
  // Client-side pagination over the already-fetched result set. Avoids
  // re-querying Supabase per page and respects the user's "less egress" ask.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  /** Load slim technician list once. Used by both the "Completed by" filter and the Report dialog. */
  const ensureTechniciansLoaded = async (): Promise<TechRow[]> => {
    if (techsLoaded) return technicianRows;
    setReportTechniciansLoading(true);
    try {
      const { data } = await db.technicians.getList(100);
      const rows = (data || []).filter((t: any) => t && t.id && t.full_name) as TechRow[];
      const opts = rows.map((t) => ({
        id: t.id,
        label: `${t.full_name ?? ''}${t.employee_id ? ` (${t.employee_id})` : ''}`,
      }));
      setTechnicianRows(rows);
      setTechnicians(opts);
      setTechsLoaded(true);
      return rows;
    } finally {
      setReportTechniciansLoading(false);
    }
  };

  // Lazy-load technicians when the user expands More filters (kept egress-light).
  useEffect(() => {
    if (!open || !showMore || techsLoaded) return;
    let active = true;
    void (async () => {
      try {
        await ensureTechniciansLoaded();
      } catch {
        if (active) toast.error("Couldn't load technicians");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showMore, techsLoaded]);

  const update = <K extends keyof AdvancedSearchFilters>(
    key: K,
    value: AdvancedSearchFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setHasSearched(false);
    setPage(1);
  };

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const { data, error } = await advancedCustomerSearch(filters);
      if (error) {
        toast.error(error.message || 'Search failed');
        setResults([]);
      } else {
        setResults(data);
        if (data.length === 0) toast.info('No customers matched these filters');
      }
      setHasSearched(true);
      // New result set — always restart at page 1 so the user lands on the
      // most relevant rows and a stale "page 5" can't render an empty list.
      setPage(1);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyPhone = async (phone: string | null) => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Phone copied');
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const handleOpenInAdmin = (row: AdvancedSearchRow, action?: 'photos') => {
    const term = row.phone || row.customer_id || '';
    if (!term) {
      toast.error('No phone or customer ID to open');
      return;
    }
    onOpenChange(false);
    const params = new URLSearchParams({ search: term });
    if (action) params.set('action', action);
    navigate(`/admin?${params.toString()}`);
  };

  const handleOpenReport = async (row: AdvancedSearchRow) => {
    // Technicians list is needed inside the report dialog to resolve completed_by names.
    // Load it on demand the first time Report is clicked.
    try {
      await ensureTechniciansLoaded();
    } catch {
      toast.error("Couldn't load technicians for report");
    }
    setReportCustomer(rowToReportCustomer(row));
    setReportDialogOpen(true);
  };

  const handleOpenMap = (row: AdvancedSearchRow) => {
    const a = row.address;
    const text = [a?.street, a?.area, a?.city].filter(Boolean).join(', ');
    if (!text) {
      toast.info('No address on this customer');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const totalResults = results.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  // Clamp the current page if results shrink (e.g. user changes pageSize or
  // a stale page index outlives a filter change). Runs as a derived value so
  // we never render an out-of-range slice.
  const safePage = Math.min(Math.max(1, page), totalPages);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const sliceStart = (safePage - 1) * pageSize;
  const sliceEnd = Math.min(sliceStart + pageSize, totalResults);
  const pageRows = useMemo(
    () => results.slice(sliceStart, sliceEnd),
    [results, sliceStart, sliceEnd]
  );

  const headerStats = useMemo(() => {
    if (!hasSearched) return null;
    if (totalResults === 0) {
      return <span className="text-sm text-muted-foreground">No matches</span>;
    }
    return (
      <span className="text-sm text-muted-foreground">
        Showing {sliceStart + 1}–{sliceEnd} of {totalResults}
      </span>
    );
  }, [hasSearched, totalResults, sliceStart, sliceEnd]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:w-[92vw] md:w-[88vw] lg:max-w-5xl max-h-[94vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="w-5 h-5 shrink-0" />
            Advanced customer search
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Combine any filters. Use commas in Location to OR multiple areas (e.g.
            "Kasavanahalli, Haralur").
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Quick filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="adv_free" className="text-xs sm:text-sm">
                Search anywhere
              </Label>
              <Input
                id="adv_free"
                placeholder="Customer ID, name, phone, email, notes…"
                value={filters.freeText ?? ''}
                onChange={(e) => update('freeText', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearch();
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adv_brand" className="text-xs sm:text-sm">
                Brand contains
              </Label>
              <Input
                id="adv_brand"
                placeholder="e.g. livpure"
                value={filters.brandContains ?? ''}
                onChange={(e) => update('brandContains', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Brand source</Label>
              <Select
                value={filters.brandSource ?? 'either'}
                onValueChange={(v) =>
                  update('brandSource', v as AdvancedSearchFilters['brandSource'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="either">Customer or past jobs</SelectItem>
                  <SelectItem value="customer">Customer record only</SelectItem>
                  <SelectItem value="jobs">Past jobs only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv_location" className="text-xs sm:text-sm">
                Location contains
              </Label>
              <Input
                id="adv_location"
                placeholder="e.g. Kasavanahalli, Haralur"
                value={filters.locationContains ?? ''}
                onChange={(e) => update('locationContains', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Service type</Label>
              <Select
                value={filters.serviceType || 'any'}
                onValueChange={(v) =>
                  update('serviceType', v === 'any' ? '' : (v as 'RO' | 'SOFTENER'))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="RO">RO</SelectItem>
                  <SelectItem value="SOFTENER">Softener</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Has active AMC</Label>
              <Select
                value={filters.hasAMC || 'any'}
                onValueChange={(v) =>
                  update('hasAMC', v === 'any' ? '' : (v as 'yes' | 'no'))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Sort by</Label>
              <Select
                value={filters.sort ?? 'last_service_desc'}
                onValueChange={(v) =>
                  update('sort', v as AdvancedSearchFilters['sort'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_service_desc">Last service (newest)</SelectItem>
                  <SelectItem value="created_desc">Customer created (newest)</SelectItem>
                  <SelectItem value="name_asc">Name (A → Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* More filters toggle */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showMore ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showMore ? 'Hide more filters' : 'More filters'}
          </button>

          {showMore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Customer status</Label>
                <Select
                  value={filters.status || 'any'}
                  onValueChange={(v) =>
                    update(
                      'status',
                      v === 'any' ? '' : (v as 'ACTIVE' | 'INACTIVE' | 'BLOCKED')
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="BLOCKED">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Has pre-filter</Label>
                <Select
                  value={filters.hasPrefilter || 'any'}
                  onValueChange={(v) =>
                    update('hasPrefilter', v === 'any' ? '' : (v as 'yes' | 'no'))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Has Google review</Label>
                <Select
                  value={filters.hasGoogleReview || 'any'}
                  onValueChange={(v) =>
                    update('hasGoogleReview', v === 'any' ? '' : (v as 'yes' | 'no'))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Service sub-type (any past job)</Label>
                <Select
                  value={filters.serviceSubType || 'any'}
                  onValueChange={(v) =>
                    update('serviceSubType', v === 'any' ? '' : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {SERVICE_SUB_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Lead source (any past job)</Label>
                <Select
                  value={filters.leadSource || 'any'}
                  onValueChange={(v) =>
                    update('leadSource', v === 'any' ? '' : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Completed by technician</Label>
                <Select
                  value={filters.completedByTechnicianId || 'any'}
                  onValueChange={(v) =>
                    update('completedByTechnicianId', v === 'any' ? '' : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={techsLoaded ? 'Any' : 'Loading technicians…'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adv_bill_min" className="text-xs sm:text-sm">
                  Bill amount min (₹)
                </Label>
                <Input
                  id="adv_bill_min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Any"
                  value={filters.billMin === '' || filters.billMin == null ? '' : filters.billMin}
                  onChange={(e) => {
                    const raw = e.target.value;
                    update('billMin', raw === '' ? '' : Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv_bill_max" className="text-xs sm:text-sm">
                  Bill amount max (₹)
                </Label>
                <Input
                  id="adv_bill_max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Any"
                  value={filters.billMax === '' || filters.billMax == null ? '' : filters.billMax}
                  onChange={(e) => {
                    const raw = e.target.value;
                    update('billMax', raw === '' ? '' : Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv_limit" className="text-xs sm:text-sm">
                  Max results
                </Label>
                <Input
                  id="adv_limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={filters.limit ?? 200}
                  onChange={(e) =>
                    update(
                      'limit',
                      Math.min(Math.max(parseInt(e.target.value || '0', 10) || 0, 1), 500)
                    )
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Last service from</Label>
                <DatePicker
                  className="w-full"
                  value={filters.lastServiceFrom || undefined}
                  onChange={(v) => update('lastServiceFrom', v || '')}
                  placeholder="Any"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Last service to</Label>
                <DatePicker
                  className="w-full"
                  value={filters.lastServiceTo || undefined}
                  onChange={(v) => update('lastServiceTo', v || '')}
                  placeholder="Any"
                />
              </div>
              <div className="hidden lg:block" />

              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Customer since from</Label>
                <DatePicker
                  className="w-full"
                  value={filters.createdSinceFrom || undefined}
                  onChange={(v) => update('createdSinceFrom', v || '')}
                  placeholder="Any"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Customer since to</Label>
                <DatePicker
                  className="w-full"
                  value={filters.createdSinceTo || undefined}
                  onChange={(v) => update('createdSinceTo', v || '')}
                  placeholder="Any"
                />
              </div>
            </div>
          )}

          {/* Action row — sticky-ish on mobile via flex wrap */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Search className="w-4 h-4 mr-2" />
              {isSearching ? 'Searching…' : 'Search'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isSearching}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <div className="ml-auto">{headerStats}</div>
          </div>

          {/* Results */}
          {hasSearched && (
            <div className="space-y-2 pt-1">
              {results.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No customers matched. Loosen a filter and try again.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pageRows.map((row) => (
                      <ResultRow
                        key={row.id}
                        row={row}
                        onOpen={() => handleOpenInAdmin(row)}
                        onCopyPhone={() => handleCopyPhone(row.phone)}
                        onMap={() => handleOpenMap(row)}
                        onReport={() => handleOpenReport(row)}
                        onPhotos={() => handleOpenInAdmin(row, 'photos')}
                        reportLoading={
                          reportTechniciansLoading &&
                          reportCustomer?.id === row.id &&
                          !reportDialogOpen
                        }
                      />
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                      <span>Per page</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                          const next = (parseInt(v, 10) as 25 | 50 | 100) || 25;
                          setPageSize(next);
                          // Keep the user near the row they were looking at
                          // when changing page size — recompute which page
                          // contains the current first-visible row.
                          const firstVisibleIndex = sliceStart;
                          setPage(Math.floor(firstVisibleIndex / next) + 1);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="hidden sm:inline">·</span>
                      <span>
                        Page {safePage} of {totalPages}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPage(1)}
                        disabled={safePage === 1}
                        title="First page"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        title="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        title="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPage(totalPages)}
                        disabled={safePage >= totalPages}
                        title="Last page"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Lazy-mounted Customer Report dialog. CustomerReportDialog itself only fetches
          jobs in its useEffect when `open` flips to true, so this stays egress-light. */}
      {reportCustomer && (
        <CustomerReportDialog
          open={reportDialogOpen}
          onOpenChange={(o) => {
            setReportDialogOpen(o);
            if (!o) setReportCustomer(null);
          }}
          customer={reportCustomer}
          technicians={technicianRows as unknown as Technician[]}
        />
      )}
    </Dialog>
  );
};

interface ResultRowProps {
  row: AdvancedSearchRow;
  onOpen: () => void;
  onCopyPhone: () => void;
  onMap: () => void;
  onReport: () => void;
  onPhotos: () => void;
  reportLoading?: boolean;
}

const ResultRow: React.FC<ResultRowProps> = ({
  row,
  onOpen,
  onCopyPhone,
  onMap,
  onReport,
  onPhotos,
  reportLoading,
}) => {
  const phone = row.phone || '';
  const waUrl = phone ? `https://wa.me/${formatPhoneForWhatsApp(phone)}` : null;
  const callUrl = phone ? `tel:${phone}` : null;

  return (
    <div className="border rounded-lg bg-card p-3 sm:p-4 hover:shadow-sm transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
              {row.customer_id || '—'}
            </span>
            <span className="font-semibold text-sm sm:text-base">
              {row.full_name || 'Unnamed customer'}
            </span>
            {row.status && row.status !== 'ACTIVE' && (
              <Badge variant="outline" className="text-xs">
                {row.status}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs sm:text-sm text-muted-foreground space-y-0.5">
            <div className="truncate">
              <span className="font-medium text-foreground">{phone || '—'}</span>
              {row.email ? <span className="ml-2">· {row.email}</span> : null}
            </div>
            <div className="truncate">
              <span className="font-medium">Location:</span> {formatLocation(row)}
            </div>
            <div className="truncate">
              <span className="font-medium">Service:</span> {row.service_type || '—'}
              {row.brand ? ` · ${row.brand}` : ''}
              {row.model ? ` ${row.model}` : ''}
            </div>
            <div className="truncate">
              <span className="font-medium">Last service:</span>{' '}
              {row.last_service_date ? (
                formatLastService(row.last_service_date)
              ) : (
                <span className="italic text-muted-foreground/80">Never serviced</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 shrink-0">
          {callUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => {
                window.location.href = callUrl;
              }}
              title="Call"
            >
              <Phone className="w-3.5 h-3.5" />
            </Button>
          )}
          {waUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-emerald-600 hover:text-emerald-700"
              onClick={() => window.open(waUrl, '_blank', 'noopener,noreferrer')}
              title="WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
            </Button>
          )}
          {phone && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={onCopyPhone}
              title="Copy phone"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={onMap}
            title="Open in Maps"
          >
            <Map className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={onReport}
            disabled={reportLoading}
            title="Customer report"
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={onPhotos}
            title="Photos (opens in Admin)"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-blue-600 hover:bg-blue-700"
            onClick={onOpen}
            title="Open in Admin"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedCustomerSearchDialog;
