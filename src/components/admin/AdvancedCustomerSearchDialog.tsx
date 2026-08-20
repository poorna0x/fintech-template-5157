import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSuspendDialogForPhotoViewer } from '@/lib/suspendDialogForPhotoViewer';
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
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Loader2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  advancedCustomerSearch,
  type AdvancedSearchFilters,
  type AdvancedSearchRow,
  DEFAULT_NEAR_RADIUS_KM,
  MAX_NEAR_RADIUS_KM,
  NEAR_RADIUS_PRESETS_KM,
  clampNearRadiusKm,
  formatNearRadiusLabel,
  isNearRadiusDraft,
  parseNearRadiusKm,
} from '@/lib/advancedCustomerSearch';
import { db } from '@/lib/supabase';
import { cn, formatPhoneForWhatsApp } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';
import type { Customer, Technician } from '@/types';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { useLeadCatalog } from '@/hooks/useLeadCatalog';
import {
  LEGACY_LEAD_SOURCE_LABELS,
  LEGACY_SERVICE_SUB_TYPE_LABELS,
} from '@/lib/leadCatalog';
import {
  extractMapsUrlFromText,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
} from '@/lib/googleMapsLink';

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

/** Fallback if catalog cache is empty (pre-migration / offline). */
const FALLBACK_LEAD_SOURCES = [...LEGACY_LEAD_SOURCE_LABELS];
const FALLBACK_SERVICE_SUB_TYPES = LEGACY_SERVICE_SUB_TYPE_LABELS.filter(
  (s) => s !== 'Other'
);

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
  const { sources, subTypes } = useLeadCatalog();
  const leadSourceOptions = useMemo(() => {
    const labels = sources.length
      ? sources.map((s) => s.label)
      : FALLBACK_LEAD_SOURCES;
    if (filters.leadSource && !labels.includes(filters.leadSource)) {
      return [...labels, filters.leadSource];
    }
    return labels;
  }, [sources, filters.leadSource]);
  const serviceSubTypeOptions = useMemo(() => {
    const labels = subTypes.length
      ? subTypes.map((s) => s.label)
      : FALLBACK_SERVICE_SUB_TYPES;
    if (filters.serviceSubType && !labels.includes(filters.serviceSubType)) {
      return [...labels, filters.serviceSubType];
    }
    return labels;
  }, [subTypes, filters.serviceSubType]);
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
  const {
    openSuspendedViewer,
    closeSuspendedViewer,
    ignoreParentDismissWhileSuspended,
  } = useSuspendDialogForPhotoViewer();
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
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const resultsAnchorRef = useRef<HTMLElement>(null);
  const scrollToResultsAfterSearchRef = useRef(false);

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
      const parsed = parseNearRadiusKm(radiusKmDraft);
      committedRadiusKm = clampNearRadiusKm(
        parsed != null ? parsed : DEFAULT_NEAR_RADIUS_KM
      );
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
          `${label} · within ${formatNearRadiusLabel(radiusKm)}${resolved.didExpandShortLink ? ' (short link resolved)' : ''}`
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
      scrollToResultsAfterSearchRef.current = true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setHasSearched(true);
      setPage(1);
      scrollToResultsAfterSearchRef.current = true;
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

  // After Search finishes, bring the results block into view (filters sit above it).
  useEffect(() => {
    if (!hasSearched || isSearching || isResolvingNear) return;
    if (!scrollToResultsAfterSearchRef.current) return;
    scrollToResultsAfterSearchRef.current = false;

    const scrollToResults = () => {
      const anchor = resultsAnchorRef.current;
      const scroller = scrollBodyRef.current;
      if (!anchor || !scroller) return;
      const top =
        anchor.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        8;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };

    const frame = window.requestAnimationFrame(() => {
      scrollToResults();
      // Layout can settle one frame later once result cards mount.
      window.requestAnimationFrame(scrollToResults);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasSearched, isSearching, isResolvingNear, results]);

  const sliceStart = (safePage - 1) * pageSize;
  const sliceEnd = Math.min(sliceStart + pageSize, totalResults);
  const pageRows = useMemo(
    () => results.slice(sliceStart, sliceEnd),
    [results, sliceStart, sliceEnd]
  );

  const headerStats = useMemo(() => {
    if (!hasSearched) return null;
    if (totalResults === 0) return 'No matches';
    return `${sliceStart + 1}–${sliceEnd} of ${totalResults}`;
  }, [hasSearched, totalResults, sliceStart, sliceEnd]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const clearKey = <K extends keyof AdvancedSearchFilters>(key: K, empty: AdvancedSearchFilters[K]) => {
      update(key, empty);
    };

    if (filters.freeText?.trim()) {
      chips.push({
        key: 'free',
        label: `“${filters.freeText.trim().slice(0, 28)}${filters.freeText.trim().length > 28 ? '…' : ''}”`,
        clear: () => clearKey('freeText', ''),
      });
    }
    if (filters.brandContains?.trim()) {
      chips.push({
        key: 'brand',
        label: `Brand: ${filters.brandContains.trim()}`,
        clear: () => {
          clearKey('brandContains', '');
          clearKey('brandSource', 'either');
        },
      });
    }
    if (filters.locationContains?.trim()) {
      chips.push({
        key: 'loc',
        label: `Area: ${filters.locationContains.trim().slice(0, 24)}`,
        clear: () => clearKey('locationContains', ''),
      });
    }
    if (filters.nearMapsLink?.trim()) {
      const r =
        typeof filters.nearRadiusKm === 'number'
          ? formatNearRadiusLabel(filters.nearRadiusKm)
          : formatNearRadiusLabel(DEFAULT_NEAR_RADIUS_KM);
      chips.push({
        key: 'near',
        label: `Near · ${r}`,
        clear: () => {
          setFilters((prev) => ({
            ...prev,
            nearMapsLink: '',
            nearLat: null,
            nearLng: null,
            nearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
          }));
          setNearResolvedLabel(null);
          setRadiusKmDraft(null);
        },
      });
    }
    if (filters.serviceType) {
      chips.push({
        key: 'svc',
        label: filters.serviceType === 'RO' ? 'RO' : 'Softener',
        clear: () => clearKey('serviceType', ''),
      });
    }
    if (filters.hasAMC) {
      chips.push({
        key: 'amc',
        label: filters.hasAMC === 'yes' ? 'AMC yes' : 'AMC no',
        clear: () => clearKey('hasAMC', ''),
      });
    }
    if (filters.status) {
      chips.push({
        key: 'status',
        label: filters.status,
        clear: () => clearKey('status', ''),
      });
    }
    if (filters.hasPrefilter) {
      chips.push({
        key: 'pref',
        label: filters.hasPrefilter === 'yes' ? 'Pre-filter' : 'No pre-filter',
        clear: () => clearKey('hasPrefilter', ''),
      });
    }
    if (filters.hasGoogleReview) {
      chips.push({
        key: 'rev',
        label: filters.hasGoogleReview === 'yes' ? 'Has review' : 'No review',
        clear: () => clearKey('hasGoogleReview', ''),
      });
    }
    if (filters.serviceSubType) {
      chips.push({
        key: 'sub',
        label: filters.serviceSubType,
        clear: () => clearKey('serviceSubType', ''),
      });
    }
    if (filters.leadSource) {
      chips.push({
        key: 'lead',
        label: filters.leadSource,
        clear: () => clearKey('leadSource', ''),
      });
    }
    if (filters.completedByTechnicianId) {
      const tech = technicians.find((t) => t.id === filters.completedByTechnicianId);
      chips.push({
        key: 'tech',
        label: tech?.label || 'Technician',
        clear: () => clearKey('completedByTechnicianId', ''),
      });
    }
    if (filters.billMin !== '' && filters.billMin != null) {
      chips.push({
        key: 'billMin',
        label: `Bill ≥ ₹${filters.billMin}`,
        clear: () => clearKey('billMin', ''),
      });
    }
    if (filters.billMax !== '' && filters.billMax != null) {
      chips.push({
        key: 'billMax',
        label: `Bill ≤ ₹${filters.billMax}`,
        clear: () => clearKey('billMax', ''),
      });
    }
    if (filters.tdsMin !== '' && filters.tdsMin != null) {
      chips.push({
        key: 'tdsMin',
        label: `TDS ≥ ${filters.tdsMin}`,
        clear: () => clearKey('tdsMin', ''),
      });
    }
    if (filters.tdsMax !== '' && filters.tdsMax != null) {
      chips.push({
        key: 'tdsMax',
        label: `TDS ≤ ${filters.tdsMax}`,
        clear: () => clearKey('tdsMax', ''),
      });
    }
    if (filters.lastServiceFrom || filters.lastServiceTo) {
      chips.push({
        key: 'lastSvc',
        label: `Last service ${filters.lastServiceFrom || '…'} → ${filters.lastServiceTo || '…'}`,
        clear: () => {
          clearKey('lastServiceFrom', '');
          clearKey('lastServiceTo', '');
        },
      });
    }
    if (filters.createdSinceFrom || filters.createdSinceTo) {
      chips.push({
        key: 'since',
        label: `Since ${filters.createdSinceFrom || '…'} → ${filters.createdSinceTo || '…'}`,
        clear: () => {
          clearKey('createdSinceFrom', '');
          clearKey('createdSinceTo', '');
        },
      });
    }
    return chips;
  }, [filters, technicians]);

  const moreFilterCount = useMemo(() => {
    let n = 0;
    if (filters.status) n += 1;
    if (filters.hasPrefilter) n += 1;
    if (filters.hasGoogleReview) n += 1;
    if (filters.serviceSubType) n += 1;
    if (filters.leadSource) n += 1;
    if (filters.completedByTechnicianId) n += 1;
    if (filters.billMin !== '' && filters.billMin != null) n += 1;
    if (filters.billMax !== '' && filters.billMax != null) n += 1;
    if (filters.tdsMin !== '' && filters.tdsMin != null) n += 1;
    if (filters.tdsMax !== '' && filters.tdsMax != null) n += 1;
    if (filters.lastServiceFrom || filters.lastServiceTo) n += 1;
    if (filters.createdSinceFrom || filters.createdSinceTo) n += 1;
    if (filters.limit != null && filters.limit !== 200) n += 1;
    return n;
  }, [filters]);

  const busy = isSearching || isResolvingNear;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-[92vw] md:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0"
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (
            t?.closest?.(
              '[data-radix-select-viewport], [role="listbox"], [role="option"], [data-radix-popper-content-wrapper], [data-radix-popover-content]'
            )
          ) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (
            t?.closest?.(
              '[data-radix-select-viewport], [role="listbox"], [role="option"], [data-radix-popper-content-wrapper], [data-radix-popover-content]'
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            Advanced search
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Combine filters to find customers. Paste a Maps link for nearby search.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollBodyRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
          style={{
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="px-4 sm:px-5 py-4 space-y-5">
            {/* Primary search */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="adv_free"
                placeholder="Name, phone, customer ID, email…"
                value={filters.freeText ?? ''}
                onChange={(e) => update('freeText', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearch();
                }}
                className="h-10 sm:flex-1"
                autoFocus={false}
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={busy}
                  className="h-10 flex-1 sm:flex-none sm:min-w-[7.5rem]"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  {isResolvingNear ? 'Resolving…' : isSearching ? 'Searching…' : 'Search'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={busy}
                  className="h-10 px-3"
                  title="Reset filters"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Reset</span>
                </Button>
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 -mt-2">
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground/80 hover:bg-muted transition-colors cursor-pointer"
                    title="Clear filter"
                  >
                    <span className="max-w-[12rem] truncate">{chip.label}</span>
                    <X className="w-3 h-3 shrink-0 opacity-60" />
                  </button>
                ))}
              </div>
            )}

            {/* Core filters */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Filters
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Brand">
                  <Input
                    id="adv_brand"
                    placeholder="e.g. livpure"
                    value={filters.brandContains ?? ''}
                    onChange={(e) => update('brandContains', e.target.value)}
                    className="h-9"
                  />
                </Field>
                <Field label="Brand match">
                  <Select
                    value={filters.brandSource ?? 'either'}
                    onValueChange={(v) =>
                      update('brandSource', v as AdvancedSearchFilters['brandSource'])
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="either">Customer or jobs</SelectItem>
                      <SelectItem value="customer">Customer only</SelectItem>
                      <SelectItem value="jobs">Past jobs only</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Area / location">
                  <Input
                    id="adv_location"
                    placeholder="Kasavanahalli, Haralur"
                    value={filters.locationContains ?? ''}
                    onChange={(e) => update('locationContains', e.target.value)}
                    className="h-9"
                    title="Comma-separated areas are OR-matched"
                  />
                </Field>
                <Field label="Service type">
                  <Select
                    value={filters.serviceType || 'any'}
                    onValueChange={(v) =>
                      update('serviceType', v === 'any' ? '' : (v as 'RO' | 'SOFTENER'))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="RO">RO</SelectItem>
                      <SelectItem value="SOFTENER">Softener</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Active AMC">
                  <Select
                    value={filters.hasAMC || 'any'}
                    onValueChange={(v) =>
                      update('hasAMC', v === 'any' ? '' : (v as 'yes' | 'no'))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sort">
                  <Select
                    value={filters.sort ?? 'last_service_desc'}
                    onValueChange={(v) =>
                      update('sort', v as AdvancedSearchFilters['sort'])
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_service_desc">Last service</SelectItem>
                      <SelectItem value="created_desc">Newest customer</SelectItem>
                      <SelectItem value="name_asc">Name A–Z</SelectItem>
                      <SelectItem value="distance_asc">Nearest first</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            {/* Near Maps — compact */}
            <section className="space-y-2.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Nearby
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_7.5rem] gap-2">
                <Input
                  id="adv_near_maps"
                  placeholder="Paste Google Maps link…"
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
                  className="h-9"
                />
                <div className="relative">
                  <Input
                    id="adv_near_radius_km"
                    type="text"
                    inputMode="text"
                    placeholder="2 km"
                    value={
                      radiusKmDraft != null
                        ? radiusKmDraft
                        : filters.nearRadiusKm === '' || filters.nearRadiusKm == null
                          ? ''
                          : String(filters.nearRadiusKm)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw !== '' && !/^[\d.\s]*[a-zA-Z]*$/.test(raw)) return;
                      setRadiusKmDraft(raw);
                      if (isNearRadiusDraft(raw)) {
                        update('nearRadiusKm', '');
                        return;
                      }
                      const parsed = parseNearRadiusKm(raw);
                      if (parsed == null) return;
                      update('nearRadiusKm', Math.min(parsed, MAX_NEAR_RADIUS_KM));
                    }}
                    onBlur={() => {
                      const parsed =
                        radiusKmDraft != null
                          ? parseNearRadiusKm(radiusKmDraft)
                          : typeof filters.nearRadiusKm === 'number'
                            ? filters.nearRadiusKm
                            : DEFAULT_NEAR_RADIUS_KM;
                      const clamped = clampNearRadiusKm(
                        parsed != null && Number.isFinite(parsed)
                          ? parsed
                          : DEFAULT_NEAR_RADIUS_KM
                      );
                      update('nearRadiusKm', clamped);
                      setRadiusKmDraft(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSearch();
                    }}
                    className="h-9 pr-12"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                    m/km
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
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
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[11px] border transition-colors cursor-pointer',
                        active
                          ? 'border-foreground/20 bg-foreground text-background'
                          : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {formatNearRadiusLabel(km)}
                    </button>
                  );
                })}
              </div>
              {nearResolvedLabel ? (
                <p className="text-[11px] text-muted-foreground truncate">{nearResolvedLabel}</p>
              ) : null}
            </section>

            {/* More filters */}
            <div>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 transition-transform duration-200',
                    showMore && 'rotate-180'
                  )}
                />
                More filters
                {moreFilterCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-foreground">
                    {moreFilterCount}
                  </span>
                )}
              </button>

              {showMore && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t">
                  <Field label="Status">
                    <Select
                      value={filters.status || 'any'}
                      onValueChange={(v) =>
                        update(
                          'status',
                          v === 'any' ? '' : (v as 'ACTIVE' | 'INACTIVE' | 'BLOCKED')
                        )
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                        <SelectItem value="BLOCKED">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Pre-filter">
                    <Select
                      value={filters.hasPrefilter || 'any'}
                      onValueChange={(v) =>
                        update('hasPrefilter', v === 'any' ? '' : (v as 'yes' | 'no'))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Google review">
                    <Select
                      value={filters.hasGoogleReview || 'any'}
                      onValueChange={(v) =>
                        update('hasGoogleReview', v === 'any' ? '' : (v as 'yes' | 'no'))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Service sub-type">
                    <Select
                      value={filters.serviceSubType || 'any'}
                      onValueChange={(v) =>
                        update('serviceSubType', v === 'any' ? '' : v)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {serviceSubTypeOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Lead source">
                    <Select
                      value={filters.leadSource || 'any'}
                      onValueChange={(v) =>
                        update('leadSource', v === 'any' ? '' : v)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {leadSourceOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Completed by">
                    <Select
                      value={filters.completedByTechnicianId || 'any'}
                      onValueChange={(v) =>
                        update('completedByTechnicianId', v === 'any' ? '' : v)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue
                          placeholder={techsLoaded ? 'Any' : 'Loading…'}
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
                  </Field>
                  <Field label="Bill min (₹)">
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
                      className="h-9"
                    />
                  </Field>
                  <Field label="Bill max (₹)">
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
                      className="h-9"
                    />
                  </Field>
                  <Field label="TDS min (ppm)">
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
                      className="h-9"
                    />
                  </Field>
                  <Field label="TDS max (ppm)">
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
                      className="h-9"
                    />
                  </Field>
                  <Field label="Max results">
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
                      className="h-9"
                    />
                  </Field>
                  <Field label="Last service from">
                    <DatePicker
                      className="w-full"
                      value={filters.lastServiceFrom || undefined}
                      onChange={(v) => update('lastServiceFrom', v || '')}
                      placeholder="Any"
                    />
                  </Field>
                  <Field label="Last service to">
                    <DatePicker
                      className="w-full"
                      value={filters.lastServiceTo || undefined}
                      onChange={(v) => update('lastServiceTo', v || '')}
                      placeholder="Any"
                    />
                  </Field>
                  <Field label="Customer since from">
                    <DatePicker
                      className="w-full"
                      value={filters.createdSinceFrom || undefined}
                      onChange={(v) => update('createdSinceFrom', v || '')}
                      placeholder="Any"
                    />
                  </Field>
                  <Field label="Customer since to">
                    <DatePicker
                      className="w-full"
                      value={filters.createdSinceTo || undefined}
                      onChange={(v) => update('createdSinceTo', v || '')}
                      placeholder="Any"
                    />
                  </Field>
                </div>
              )}
            </div>

            {/* Results */}
            {hasSearched && (
              <section ref={resultsAnchorRef} className="space-y-3 border-t pt-4 scroll-mt-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Results
                  </h3>
                  {headerStats && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {headerStats}
                    </span>
                  )}
                </div>

                {results.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
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

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground mr-1">Per page</span>
                        {([25, 50, 100] as const).map((size) => (
                          <button
                            key={size}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (pageSize === size) return;
                              const firstVisibleIndex = sliceStart;
                              setPageSize(size);
                              setPage(Math.floor(firstVisibleIndex / size) + 1);
                            }}
                            className={cn(
                              'h-7 min-w-8 rounded-md px-2 text-xs tabular-nums transition-colors cursor-pointer',
                              pageSize === size
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {size}
                          </button>
                        ))}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={safePage <= 1 || busy}
                            onClick={() => {
                              if (safePage > 1) setPage(safePage - 1);
                            }}
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-xs tabular-nums text-muted-foreground min-w-[4rem] text-center">
                            {safePage} / {totalPages}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={safePage >= totalPages || busy}
                            onClick={() => {
                              if (safePage < totalPages) setPage(safePage + 1);
                            }}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Lazy-mounted Customer Report dialog. CustomerReportDialog itself only fetches
          jobs in its useEffect when `open` flips to true, so this stays egress-light. */}
      {reportCustomer && (
        <CustomerReportDialog
          open={reportDialogOpen}
          photoViewerOpen={reportPhotoViewerOpen}
          onOpenChange={(o) => {
            if (!o && ignoreParentDismissWhileSuspended()) return;
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
            const safeIndex = Math.min(Math.max(0, index), list.length - 1);
            openSuspendedViewer(
              () => setReportDialogOpen(false),
              () => {
                setReportSelectedBillPhotos(list);
                setReportSelectedPhoto({
                  url: list[safeIndex] || url,
                  index: safeIndex,
                  total: list.length || total,
                });
                setReportPhotoViewerOpen(true);
              }
            );
          }}
          onBillPhotosClick={(photos, index) => {
            if (!photos.length) return;
            const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
            openSuspendedViewer(
              () => setReportDialogOpen(false),
              () => {
                setReportSelectedBillPhotos(photos);
                setReportSelectedPhoto({
                  url: photos[safeIndex],
                  index: safeIndex,
                  total: photos.length,
                });
                setReportPhotoViewerOpen(true);
              }
            );
          }}
        />
      )}

      {/* Photo viewer for bill/payment images opened from the Report dialog. */}
      {reportPhotoViewerOpen && (
        <PhotoViewerDialog
          open={reportPhotoViewerOpen}
          onOpenChange={(open) => {
            if (open) {
              setReportPhotoViewerOpen(true);
              return;
            }
            closeSuspendedViewer(
              () => setReportDialogOpen(true),
              () => {
                setReportPhotoViewerOpen(false);
                setReportSelectedPhoto(null);
                setReportSelectedBillPhotos(null);
              }
            );
          }}
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
          onClose={() => {
            closeSuspendedViewer(
              () => setReportDialogOpen(true),
              () => {
                setReportPhotoViewerOpen(false);
                setReportSelectedPhoto(null);
                setReportSelectedBillPhotos(null);
              }
            );
          }}
        />
      )}
    </Dialog>
  );
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

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
  const meta = [
    row.service_type || null,
    row.brand || null,
    row.model || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tds =
    row.raw_water_tds != null && row.raw_water_tds > 0
      ? `${row.raw_water_tds} ppm`
      : null;

  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-muted/30 transition-colors">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
              {row.customer_id || '—'}
            </span>
            <button
              type="button"
              onClick={onOpen}
              className="font-medium text-sm text-left hover:underline underline-offset-2 cursor-pointer truncate max-w-full"
            >
              {row.full_name || 'Unnamed customer'}
            </button>
            {row.status && row.status !== 'ACTIVE' && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                {row.status}
              </Badge>
            )}
            {typeof row.distance_km === 'number' && Number.isFinite(row.distance_km) && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                {`${Math.round(row.distance_km * 1000).toLocaleString('en-IN')} m`}
                {row.matched_site === 'alternate' ? ' · alt' : ''}
              </Badge>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2 truncate">
              <span className="text-foreground/90 tabular-nums">{phone || '—'}</span>
              {row.email ? <span className="truncate">· {row.email}</span> : null}
            </div>
            <div className="truncate">{formatLocation(row)}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {meta ? <span className="truncate">{meta}</span> : null}
              <span>
                {row.last_service_date
                  ? formatLastService(row.last_service_date)
                  : 'Never serviced'}
              </span>
              {tds ? <span>TDS {tds}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 self-start">
          {callUrl && (
            <IconAction
              title="Call"
              onClick={() => {
                window.location.href = callUrl;
              }}
            >
              <Phone className="w-3.5 h-3.5" />
            </IconAction>
          )}
          {waUrl && (
            <IconAction
              title="WhatsApp"
              className="text-emerald-600 hover:text-emerald-700"
              onClick={() => window.open(waUrl, '_blank', 'noopener,noreferrer')}
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
            </IconAction>
          )}
          {phone && (
            <IconAction title="Copy phone" onClick={onCopyPhone}>
              <Copy className="w-3.5 h-3.5" />
            </IconAction>
          )}
          <IconAction title="Maps" onClick={onMap}>
            <Map className="w-3.5 h-3.5" />
          </IconAction>
          <IconAction title="Report" onClick={onReport} disabled={reportLoading}>
            <FileText className="w-3.5 h-3.5" />
          </IconAction>
          <IconAction title="Photos" onClick={onPhotos}>
            <ImageIcon className="w-3.5 h-3.5" />
          </IconAction>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5 ml-0.5"
            onClick={onOpen}
            title="Open in Admin"
          >
            <ExternalLink className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Open</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

function IconAction({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn('h-8 w-8 p-0 text-muted-foreground hover:text-foreground', className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  );
}

export default AdvancedCustomerSearchDialog;
