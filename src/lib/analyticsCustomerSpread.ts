import { hubContainsPoint, type BookingServiceHub } from '@/lib/bookingServiceHubs';

export type SpreadColorMode = 'customers' | 'billing' | 'brand';

export type SpreadBrandShare = {
  name: string;
  jobs: number;
  revenue: number;
};

export type SpreadCell = {
  lat: number;
  lng: number;
  customers: number;
  jobs: number;
  revenue: number;
  avg_bill: number;
  avg_tds: number | null;
  area: string;
  installation: number;
  service: number;
  top_brand: string;
  top_brand_jobs: number;
  top_brand_share: number;
  brands: SpreadBrandShare[];
};

export type SpreadPayload = {
  cell_km: number;
  jobs_total: number;
  jobs_with_pin: number;
  customers_with_pin: number;
  cells: SpreadCell[];
};

export type SpreadInsight = {
  id: string;
  title: string;
  detail: string;
  cell: SpreadCell;
};

const BRAND_PALETTE = ['#0284c7', '#7c3aed', '#d97706', '#059669', '#e11d48', '#4f46e5', '#0f766e', '#be185d'];

export function brandColor(name: string): string {
  const key = String(name || 'Unknown');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return BRAND_PALETTE[h % BRAND_PALETTE.length];
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseBrand(row: unknown): SpreadBrandShare | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const name = String(r.name || '').trim() || 'Unknown';
  return { name, jobs: num(r.jobs), revenue: num(r.revenue) };
}

export function parseSpreadCell(row: unknown): SpreadCell | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const lat = num(r.lat);
  const lng = num(r.lng);
  if (!lat && !lng) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const brands = Array.isArray(r.brands)
    ? r.brands.map(parseBrand).filter((b): b is SpreadBrandShare => Boolean(b))
    : [];
  const tdsRaw = r.avg_tds;
  const avg_tds = tdsRaw == null || tdsRaw === '' ? null : num(tdsRaw);
  return {
    lat,
    lng,
    customers: Math.max(0, Math.round(num(r.customers))),
    jobs: Math.max(0, Math.round(num(r.jobs))),
    revenue: Math.max(0, num(r.revenue)),
    avg_bill: Math.max(0, num(r.avg_bill)),
    avg_tds: avg_tds != null && avg_tds > 0 ? avg_tds : null,
    area: String(r.area || 'Unknown').trim() || 'Unknown',
    installation: Math.max(0, Math.round(num(r.installation))),
    service: Math.max(0, Math.round(num(r.service))),
    top_brand: String(r.top_brand || brands[0]?.name || 'Unknown').trim() || 'Unknown',
    top_brand_jobs: Math.max(0, Math.round(num(r.top_brand_jobs) || brands[0]?.jobs || 0)),
    top_brand_share: Math.max(0, Math.min(100, num(r.top_brand_share))),
    brands,
  };
}

export function parseSpreadPayload(raw: unknown): SpreadPayload {
  const empty: SpreadPayload = {
    cell_km: 1.2,
    jobs_total: 0,
    jobs_with_pin: 0,
    customers_with_pin: 0,
    cells: [],
  };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const cells = Array.isArray(r.cells)
    ? r.cells.map(parseSpreadCell).filter((c): c is SpreadCell => Boolean(c))
    : [];
  return {
    cell_km: Math.max(0.5, num(r.cell_km) || 1.2),
    jobs_total: Math.max(0, Math.round(num(r.jobs_total))),
    jobs_with_pin: Math.max(0, Math.round(num(r.jobs_with_pin))),
    customers_with_pin: Math.max(0, Math.round(num(r.customers_with_pin))),
    cells,
  };
}

function lerpHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  };
  const a = parse(from);
  const b = parse(to);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * clamp));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function spreadValue(cell: SpreadCell, mode: SpreadColorMode): number {
  if (mode === 'billing') return cell.revenue;
  if (mode === 'brand') return cell.top_brand_share;
  return cell.customers;
}

export function spreadFillColor(
  cell: SpreadCell,
  maxValue: number,
  mode: SpreadColorMode
): { fill: string; stroke: string } {
  if (mode === 'brand') {
    const stroke = brandColor(cell.top_brand);
    return { fill: `${stroke}55`, stroke };
  }
  const t = maxValue > 0 ? Math.sqrt(spreadValue(cell, mode) / maxValue) : 0;
  const mid = mode === 'billing' ? '#16a34a' : '#0284c7';
  const high = mode === 'billing' ? '#14532d' : '#e11d48';
  const low = mode === 'billing' ? '#bbf7d0' : '#7dd3fc';
  const stroke = t < 0.5 ? lerpHex(low, mid, t * 2) : lerpHex(mid, high, (t - 0.5) * 2);
  return { fill: `${stroke}59`, stroke };
}

export function spreadCircleRadiusMeters(cell: SpreadCell, maxCustomers: number): number {
  const t = maxCustomers > 0 ? Math.sqrt(cell.customers / maxCustomers) : 0.2;
  return Math.round(220 + t * 980);
}

export function formatSpreadInr(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function cellOutsideHubs(cell: SpreadCell, hubs: BookingServiceHub[]): boolean {
  const serving = hubs.filter((h) => h.is_active && h.service_kind !== 'no_service');
  if (serving.length === 0) return false;
  return !serving.some((hub) => hubContainsPoint(hub, cell.lat, cell.lng));
}

export function buildSpreadInsights(
  cells: SpreadCell[],
  hubs: BookingServiceHub[] = []
): SpreadInsight[] {
  if (cells.length === 0) return [];
  const insights: SpreadInsight[] = [];
  const densest = [...cells].sort((a, b) => b.customers - a.customers || b.jobs - a.jobs)[0];
  insights.push({
    id: 'densest',
    title: 'Busiest pocket',
    detail: `${densest.area} · ${densest.customers} customers · ${densest.jobs} jobs`,
    cell: densest,
  });
  const richest = [...cells].sort((a, b) => b.revenue - a.revenue)[0];
  if (richest.revenue > 0) {
    insights.push({
      id: 'richest',
      title: 'Highest billing',
      detail: `${richest.area} · ${formatSpreadInr(richest.revenue)} · ${richest.top_brand}`,
      cell: richest,
    });
  }
  const premium = [...cells]
    .filter((c) => c.jobs >= 3 && c.avg_bill > 0)
    .sort((a, b) => b.avg_bill - a.avg_bill)[0];
  if (premium) {
    insights.push({
      id: 'premium',
      title: 'Highest avg bill',
      detail: `${premium.area} · ${formatSpreadInr(premium.avg_bill)} per job · ${premium.jobs} jobs`,
      cell: premium,
    });
  }
  const stronghold = [...cells]
    .filter((c) => c.jobs >= 4 && c.top_brand_share >= 50 && c.top_brand !== 'Unknown')
    .sort((a, b) => b.top_brand_share - a.top_brand_share || b.jobs - a.jobs)[0];
  if (stronghold) {
    insights.push({
      id: 'brand',
      title: `${stronghold.top_brand} stronghold`,
      detail: `${stronghold.area} · ${stronghold.top_brand_share}% of jobs in this pocket`,
      cell: stronghold,
    });
  }
  const outside = cells
    .filter((c) => cellOutsideHubs(c, hubs))
    .sort((a, b) => b.customers - a.customers)[0];
  if (outside) {
    insights.push({
      id: 'outside',
      title: 'Customers outside coverage',
      detail: `${outside.area} · ${outside.customers} customers sit outside Location Hubs`,
      cell: outside,
    });
  }
  return insights.slice(0, 5);
}

export function maxSpreadValue(cells: SpreadCell[], mode: SpreadColorMode): number {
  return cells.reduce((max, cell) => Math.max(max, spreadValue(cell, mode)), 0);
}
