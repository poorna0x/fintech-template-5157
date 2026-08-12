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
  MapPin,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Loader2,
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
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';
import type { Customer, Technician } from '@/types';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  extractMapsUrlFromText,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
} from '@/lib/googleMapsLink';

const NEAR_RADIUS_PRESETS_KM = [0.2, 0.5, 1, 2, 3, 5, 10] as const;
const DEFAULT_NEAR_RADIUS_KM = 2;
const MIN_NEAR_RADIUS_KM = 0;
const MAX_NEAR_RADIUS_KM = 50;

function clampNearRadiusKm(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_NEAR_RADIUS_KM;
  const rounded = Math.round(raw * 1000) / 1000;
  return Math.min(Math.max(rounded, MIN_NEAR_RADIUS_KM), MAX_NEAR_RADIUS_KM);
}

function formatKmLabel(km: number): string {
  const rounded = Math.round(km * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, '');
  return `${text} km`;
}

function isKmDraft(raw: string): boolean {
  return raw === '' || raw === '.' || /^\d+\.$/.test(raw);
}

interface AdvancedCustomerSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FILTERS: AdvancedSearchFilters = {
  freeText: '',
  brandContains: '',
  brandSource: 'either',
  locationContains: '',
  nearMapsLink: '',
  nearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
  nearLat: null,
  nearLng: null,
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
  tdsMin: '',
  tdsMax: '',
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
  'Return Service',
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
  // Photo viewer state for clicking bill/payment images inside the Report dialog.
  const [reportPhotoViewerOpen, setReportPhotoViewerOpen] = useState(false);
  const [reportSelectedPhoto, setReportSelectedPhoto] = useState<{
    url: string;
    index: number;
    total: number;
  } | null>(null);
  const [reportSelectedBillPhotos, setReportSelectedBillPhotos] = useState<string[] | null>(null);
  // Client-side pagination over the already-fetched result set. Avoids
  // re-querying Supabase per page and respects the user's "less egress" ask.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [nearResolvedLabel, setNearResolvedLabel] = useState<string | null>(null);
  const [isResolvingNear, setIsResolvingNear] = useState(false);
  /** Local draft so backspace / "0." work without snapping to the min. */
  const [radiusKmDraft, setRadiusKmDraft] = useState<string | null>(null);

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
    setNearResolvedLabel(null);
    setRadiusKmDraft(null);
  };

  const handleSearch = async () => {
    let committedRadiusKm = DEFAULT_NEAR_RADIUS_KM;
    if (radiusKmDraft != null) {
      const n =
        isKmDraft(radiusKmDraft) || radiusKmDraft.trim() === ''
          ? DEFAULT_NEAR_RADIUS_KM
          : Number(radiusKmDraft);
      committedRadiusKm = clampNearRadiusKm(Number.isFinite(n) ? n : DEFAULT_NEAR_RADIUS_KM);
      update('nearRadiusKm', committedRadiusKm);
      setRadiusKmDraft(null);
    } else {
      committedRadiusKm = clampNearRadiusKm(
        typeof filters.nearRadiusKm === 'number' ? filters.nearRadiusKm : DEFAULT_NEAR_RADIUS_KM
      );
    }

    setIsSearching(true);
    try {
      let searchFilters: AdvancedSearchFilters = {
        ...filters,
        nearRadiusKm: committedRadiusKm,
        nearLat: null,
        nearLng: null,
      };

      const mapsPaste = (filters.nearMapsLink ?? '').trim();
      if (mapsPaste) {
        const mapsUrl = extractMapsUrlFromText(mapsPaste) || mapsPaste;
        if (!isGoogleMapsUrl(mapsUrl)) {
          toast.error('Paste a valid Google Maps link (maps.app.goo.gl or google.com/maps)');
          setIsSearching(false);
          return;
        }

        setIsResolvingNear(true);
        const token = await resolveSupabaseAccessTokenForApi();
        const resolved = await resolveGoogleMapsInputToCoords(mapsUrl, {
          shareText: mapsPaste,
          accessToken: token,
        });
        setIsResolvingNear(false);

        if (!resolved.ok) {
          toast.error(resolved.error || 'Could not resolve that Maps link');
          setIsSearching(false);
          return;
        }

        const radiusKm = committedRadiusKm;

        searchFilters = {
          ...searchFilters,
          nearLat: resolved.coords.latitude,
          nearLng: resolved.coords.longitude,
          nearRadiusKm: radiusKm,
          sort:
            filters.sort === 'last_service_desc' || !filters.sort
              ? 'distance_asc'
              : filters.sort,
        };

        const label =
          resolved.placeHintUsed ||
          `${resolved.coords.latitude.toFixed(5)}, ${resolved.coords.longitude.toFixed(5)}`;
        setNearResolvedLabel(
          `${label} · within ${formatKmLabel(radiusKm)}${resolved.didExpandShortLink ? ' (short link resolved)' : ''}`
        );
        setFilters((prev) => ({
          ...prev,
          nearLat: resolved.coords.latitude,
          nearLng: resolved.coords.longitude,
          nearRadiusKm: radiusKm,
        }));
        setRadiusKmDraft(null);
      } else {
        setNearResolvedLabel(null);
      }

      const { data, error } = await advancedCustomerSearch(searchFilters);
      if (error) {
        toast.error(error.message || 'Search failed');
        setResults([]);
      } else {
        setResults(data);
        if (data.length === 0) toast.info('No customers matched these filters');
      }
      setHasSearched(true);
      setPage(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setHasSearched(true);
      setPage(1);
    } finally {
      setIsResolvingNear(false);
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
            Combine any filters. Paste a Google Maps link (short links work) and pick a
            radius to find customers near that pin. Use commas in Location contains to OR
            multiple areas (e.g. Kasavanahalli, Haralur).
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

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs sm:text-sm font-medium">Near Maps location</Label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="adv_near_maps" className="text-xs text-muted-foreground">
                    Google Maps link
                  </Label>
                  <Input
                    id="adv_near_maps"
                    placeholder="https://maps.app.goo.gl/… or full maps URL"
                    value={filters.nearMapsLink ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilters((prev) => ({
                        ...prev,
                        nearMapsLink: value,
                        nearLat: null,
                        nearLng: null,
                      }));
                      setNearResolvedLabel(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSearch();
                    }}
                  />
                </div>
                <div className="space-y-1.5 sm:w-40">
                  <Label htmlFor="adv_near_radius_km" className="text-xs text-muted-foreground">
                    Radius (km)
                  </Label>
                  <div className="relative">
                    <Input
                      id="adv_near_radius_km"
                      type="text"
                      inputMode="decimal"
                      value={
                        radiusKmDraft != null
                          ? radiusKmDraft
                          : filters.nearRadiusKm === '' || filters.nearRadiusKm == null
                            ? ''
                            : String(filters.nearRadiusKm)
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                        setRadiusKmDraft(raw);
                        if (isKmDraft(raw)) {
                          update('nearRadiusKm', '');
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n) || n < 0) return;
                        update('nearRadiusKm', Math.min(n, MAX_NEAR_RADIUS_KM));
                      }}
                      onBlur={() => {
                        const fromDraft =
                          radiusKmDraft != null && !isKmDraft(radiusKmDraft)
                            ? Number(radiusKmDraft)
                            : typeof filters.nearRadiusKm === 'number'
                              ? filters.nearRadiusKm
                              : DEFAULT_NEAR_RADIUS_KM;
                        const clamped = clampNearRadiusKm(
                          Number.isFinite(fromDraft) ? fromDraft : DEFAULT_NEAR_RADIUS_KM
                        );
                        update('nearRadiusKm', clamped);
                        setRadiusKmDraft(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSearch();
                      }}
                      className="pr-9"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      km
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {NEAR_RADIUS_PRESETS_KM.map((km) => {
                  const active =
                    (typeof filters.nearRadiusKm === 'number'
                      ? filters.nearRadiusKm
                      : DEFAULT_NEAR_RADIUS_KM) === km && radiusKmDraft == null;
                  return (
                    <button
                      key={km}
                      type="button"
                      onClick={() => {
                        update('nearRadiusKm', km);
                        setRadiusKmDraft(null);
                      }}
                      className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {formatKmLabel(km)}
                    </button>
                  );
                })}
              </div>
              {nearResolvedLabel ? (
                <p className="mt-2 text-xs text-muted-foreground">{nearResolvedLabel}</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Short links are resolved automatically. Enter radius in km (e.g. 0.5 = 500 m,
                  max 50 km), or tap a preset. Matches customers with a saved map pin inside that
                  distance.
                </p>
              )}
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
                  <SelectItem value="distance_asc">Nearest first (Maps radius)</SelectItem>
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
                <Label htmlFor="adv_tds_min" className="text-xs sm:text-sm">
                  Raw water TDS min (ppm)
                </Label>
                <Input
                  id="adv_tds_min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Any"
                  value={filters.tdsMin === '' || filters.tdsMin == null ? '' : filters.tdsMin}
                  onChange={(e) => {
                    const raw = e.target.value;
                    update('tdsMin', raw === '' ? '' : Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv_tds_max" className="text-xs sm:text-sm">
                  Raw water TDS max (ppm)
                </Label>
                <Input
                  id="adv_tds_max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Any"
                  value={filters.tdsMax === '' || filters.tdsMax == null ? '' : filters.tdsMax}
                  onChange={(e) => {
                    const raw = e.target.value;
                    update('tdsMax', raw === '' ? '' : Math.max(0, Number(raw) || 0));
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
              disabled={isSearching || isResolvingNear}
            >
              {isResolvingNear || isSearching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {isResolvingNear ? 'Resolving Maps link…' : isSearching ? 'Searching…' : 'Search'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isSearching || isResolvingNear}>
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

                  <div className="mt-3 pt-3 border-t space-y-3">
                    <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                      Showing {sliceStart + 1}–{sliceEnd} of {totalResults}
                    </p>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Per page</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([25, 50, 100] as const).map((size) => (
                          <Button
                            key={size}
                            type="button"
                            size="sm"
                            variant={pageSize === size ? 'default' : 'outline'}
                            className="h-8 text-xs w-full touch-manipulation"
                            disabled={isSearching}
                            onClick={() => {
                              if (pageSize === size) return;
                              const firstVisibleIndex = sliceStart;
                              setPageSize(size);
                              setPage(Math.floor(firstVisibleIndex / size) + 1);
                            }}
                          >
                            {size}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {totalPages > 1 && (
                      <div className="w-full min-w-0 max-w-full">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-full">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 touch-manipulation"
                              disabled={safePage <= 1 || isSearching}
                              onClick={() => {
                                if (safePage > 1) {
                                  setPage(safePage - 1);
                                }
                              }}
                            >
                              <ArrowLeft className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">Previous</span>
                            </Button>
                            <span className="text-sm text-foreground/90 tabular-nums px-2 text-center min-w-[5.5rem]">
                              {safePage} / {totalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 touch-manipulation"
                              disabled={safePage >= totalPages || isSearching}
                              onClick={() => {
                                if (safePage < totalPages) {
                                  setPage(safePage + 1);
                                }
                              }}
                            >
                              <span className="hidden sm:inline">Next</span>
                              <ArrowRight className="h-4 w-4 sm:ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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
          photoViewerOpen={reportPhotoViewerOpen}
          onOpenChange={(o) => {
            setReportDialogOpen(o);
            if (!o) {
              setReportCustomer(null);
              setReportPhotoViewerOpen(false);
            }
          }}
          customer={reportCustomer}
          technicians={technicianRows as unknown as Technician[]}
          onPhotoClick={(url, index, total, photos) => {
            const list = photos && photos.length > 0 ? photos : [url];
            setReportSelectedBillPhotos(list);
            setReportSelectedPhoto({ url: list[index] || url, index, total: list.length || total });
            setReportPhotoViewerOpen(true);
          }}
          onBillPhotosClick={(photos, index) => {
            setReportSelectedBillPhotos(photos);
            setReportSelectedPhoto({
              url: photos[index],
              index,
              total: photos.length,
            });
            setReportPhotoViewerOpen(true);
          }}
        />
      )}

      {/* Photo viewer for bill/payment images opened from the Report dialog. */}
      {reportPhotoViewerOpen && (
        <PhotoViewerDialog
          open={reportPhotoViewerOpen}
          onOpenChange={setReportPhotoViewerOpen}
          selectedPhoto={reportSelectedPhoto}
          selectedBillPhotos={reportSelectedBillPhotos}
          selectedJobPhotos={null}
          showNavigation={Boolean(reportSelectedBillPhotos && reportSelectedBillPhotos.length > 1)}
          onPrevious={() => {
            if (
              !reportSelectedPhoto ||
              !reportSelectedBillPhotos ||
              reportSelectedBillPhotos.length <= 1
            ) {
              return;
            }
            const newIndex =
              reportSelectedPhoto.index > 0
                ? reportSelectedPhoto.index - 1
                : reportSelectedBillPhotos.length - 1;
            setReportSelectedPhoto({
              url: reportSelectedBillPhotos[newIndex],
              index: newIndex,
              total: reportSelectedBillPhotos.length,
            });
          }}
          onNext={() => {
            if (
              !reportSelectedPhoto ||
              !reportSelectedBillPhotos ||
              reportSelectedBillPhotos.length <= 1
            ) {
              return;
            }
            const newIndex =
              reportSelectedPhoto.index < reportSelectedBillPhotos.length - 1
                ? reportSelectedPhoto.index + 1
                : 0;
            setReportSelectedPhoto({
              url: reportSelectedBillPhotos[newIndex],
              index: newIndex,
              total: reportSelectedBillPhotos.length,
            });
          }}
          onDownload={(photoUrl) => {
            const link = document.createElement('a');
            link.href = photoUrl;
            link.download = `photo-${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          onClose={() => setReportPhotoViewerOpen(false)}
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
            {typeof row.distance_km === 'number' && Number.isFinite(row.distance_km) && (
              <Badge variant="secondary" className="text-xs">
                {`${Math.round(row.distance_km * 1000).toLocaleString('en-IN')} m`}
                {row.matched_site === 'alternate' ? ' · alt pin' : ''}
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
            <div className="truncate">
              <span className="font-medium">Raw water TDS:</span>{' '}
              {row.raw_water_tds != null && row.raw_water_tds > 0
                ? `${row.raw_water_tds} ppm`
                : '—'}
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
            title="Gallery (opens in Admin)"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-8 "
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
