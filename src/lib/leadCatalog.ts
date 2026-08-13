/**
 * Admin-managed lead sources, sub-services, and cost rules.
 * Loaded once per session (memory + sessionStorage TTL) — not on every field change.
 */
import { supabase } from '@/lib/supabaseClient';

export type LeadSourceRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  active: boolean;
  requires_otp: boolean;
  allow_custom_text: boolean;
  default_cost_inr: number;
  aliases: string[];
};

export type ServiceSubTypeRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  active: boolean;
  allow_custom_text: boolean;
  aliases: string[];
};

export type LeadCostRuleRow = {
  id: string;
  lead_source_id: string;
  service_sub_type_id: string | null;
  cost_inr: number;
  priority: number;
};

export type LeadCatalog = {
  sources: LeadSourceRow[];
  subTypes: ServiceSubTypeRow[];
  rules: LeadCostRuleRow[];
};

/** Fallback when DB/cache unavailable (matches pre-catalog defaults). */
export const LEGACY_LEAD_SOURCE_LABELS = [
  'Website',
  'Direct call',
  'Google-Leads',
  'RO care india',
  'Home Triangle',
  'Home Triangle-Srujan',
  'Home Triangle-3',
  'Local Ramu',
  'Other',
] as const;

export const LEGACY_SERVICE_SUB_TYPE_LABELS = [
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
  'Other',
] as const;

const CACHE_KEY = 'lead_catalog_cache_v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

let catalogMem: { catalog: LeadCatalog; at: number } | null = null;
let loadPromise: Promise<LeadCatalog> | null = null;

function normalizeCatalog(raw: unknown): LeadCatalog {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const sources = (Array.isArray(o.sources) ? o.sources : []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      slug: String(row.slug || ''),
      label: String(row.label || ''),
      sort_order: num(row.sort_order),
      active: row.active !== false,
      requires_otp: row.requires_otp === true,
      allow_custom_text: row.allow_custom_text === true,
      default_cost_inr: num(row.default_cost_inr),
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    } satisfies LeadSourceRow;
  });
  const subTypes = (Array.isArray(o.sub_types) ? o.sub_types : []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      slug: String(row.slug || ''),
      label: String(row.label || ''),
      sort_order: num(row.sort_order),
      active: row.active !== false,
      allow_custom_text: row.allow_custom_text === true,
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    } satisfies ServiceSubTypeRow;
  });
  const rules = (Array.isArray(o.rules) ? o.rules : []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      lead_source_id: String(row.lead_source_id || ''),
      service_sub_type_id: row.service_sub_type_id ? String(row.service_sub_type_id) : null,
      cost_inr: num(row.cost_inr),
      priority: num(row.priority, 10),
    } satisfies LeadCostRuleRow;
  });
  return { sources, subTypes, rules };
}

function readSessionCache(): { catalog: LeadCatalog; at: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { catalog?: LeadCatalog; at?: number };
    if (!parsed?.catalog || !parsed.at) return null;
    if (Date.now() - parsed.at >= CACHE_TTL_MS) return null;
    return { catalog: parsed.catalog, at: parsed.at };
  } catch {
    return null;
  }
}

function writeSessionCache(catalog: LeadCatalog): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ catalog, at: Date.now() }));
  } catch {
    /* quota */
  }
}

export function invalidateLeadCatalogCache(): void {
  catalogMem = null;
  loadPromise = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function peekLeadCatalog(): LeadCatalog | null {
  if (catalogMem && Date.now() - catalogMem.at < CACHE_TTL_MS) {
    return catalogMem.catalog;
  }
  const stored = readSessionCache();
  if (stored) {
    catalogMem = stored;
    return stored.catalog;
  }
  return null;
}

export function isLeadCatalogCached(): boolean {
  return peekLeadCatalog() !== null;
}

export async function ensureLeadCatalogLoaded(opts?: {
  force?: boolean;
  includeInactive?: boolean;
}): Promise<LeadCatalog> {
  if (!opts?.force) {
    const cached = peekLeadCatalog();
    if (cached && !opts?.includeInactive) return cached;
  }

  if (!opts?.force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { data, error } = await supabase.rpc('get_lead_catalog', {
      p_include_inactive: Boolean(opts?.includeInactive),
    });
    if (error) {
      if (/get_lead_catalog|could not find|does not exist/i.test(error.message || '')) {
        const fallbackSources = LEGACY_LEAD_SOURCE_LABELS.map((label, i) => ({
          id: `legacy-src-${i}`,
          slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label,
          sort_order: i * 10,
          active: true,
          requires_otp: label.toLowerCase().startsWith('home triangle'),
          allow_custom_text: label === 'Other',
          default_cost_inr: legacyDefaultCostOnly(label),
          aliases: [] as string[],
        }));
        const fallbackSubTypes = LEGACY_SERVICE_SUB_TYPE_LABELS.map((label, i) => ({
          id: `legacy-sub-${i}`,
          slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label,
          sort_order: i * 10,
          active: true,
          allow_custom_text: label === 'Other',
          aliases: [] as string[],
        }));
        const fallback: LeadCatalog = {
          sources: fallbackSources,
          subTypes: fallbackSubTypes,
          rules: buildLegacyRules(fallbackSources, fallbackSubTypes),
        };
        catalogMem = { catalog: fallback, at: Date.now() };
        writeSessionCache(fallback);
        return fallback;
      }
      throw new Error(error.message || 'Failed to load lead catalog');
    }
    const catalog = normalizeCatalog(data);
    catalogMem = { catalog, at: Date.now() };
    writeSessionCache(catalog);
    return catalog;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function legacyDefaultCostOnly(leadSource: string): number {
  const s = leadSource.trim().toLowerCase();
  if (s.startsWith('home triangle')) return 231;
  if (s === 'ro care india') return 400;
  if (s === 'local ramu') return 500;
  return 0;
}

function buildLegacyRules(sources: LeadSourceRow[], subTypes: ServiceSubTypeRow[]): LeadCostRuleRow[] {
  const rules: LeadCostRuleRow[] = [];
  let i = 0;
  const srcSlugs = ['home_triangle', 'home_triangle_srujan', 'home_triangle_3'];
  const subSlugs = ['installation', 'reinstallation'];
  for (const srcSlug of srcSlugs) {
    const source = sources.find((s) => s.slug === srcSlug);
    if (!source) continue;
    for (const subSlug of subSlugs) {
      const subType = subTypes.find((st) => st.slug === subSlug);
      if (!subType) continue;
      rules.push({
        id: `legacy-rule-${i++}`,
        lead_source_id: source.id,
        service_sub_type_id: subType.id,
        cost_inr: 116,
        priority: 20,
      });
    }
  }
  return rules;
}

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function resolveSubTypeLabel(
  serviceSubType?: string,
  serviceSubTypeCustom?: string
): string {
  const base = (serviceSubType || '').trim();
  if (base === 'Custom' || base === 'Other') {
    return (serviceSubTypeCustom || '').trim() || base;
  }
  return base;
}

function sourceMatchesText(s: LeadSourceRow, lower: string, compact: string): boolean {
  if (s.label.toLowerCase() === lower) return true;
  if (compactKey(s.label) === compact) return true;
  if (s.slug === compact.replace(/[^a-z0-9_]/g, '_')) return true;
  return s.aliases.some((a) => a.toLowerCase() === lower);
}

function findSource(catalog: LeadCatalog, leadSource: string): LeadSourceRow | null {
  const raw = (leadSource || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const compact = compactKey(raw);

  const pick = (sources: LeadSourceRow[]) => {
    for (const s of sources) {
      if (sourceMatchesText(s, lower, compact)) return s;
    }
    return null;
  };

  const active = catalog.sources.filter((s) => s.active);
  const matched = pick(active) ?? pick(catalog.sources.filter((s) => !s.active));
  if (matched) return matched;

  if (lower.startsWith('website (')) {
    return catalog.sources.find((s) => s.slug === 'website') ?? null;
  }
  if (lower.startsWith('home triangle')) {
    return (
      catalog.sources.find((s) => s.label.toLowerCase() === lower) ||
      catalog.sources.find((s) => s.slug === 'home_triangle') ||
      null
    );
  }
  return null;
}

function findSubType(catalog: LeadCatalog, subLabel: string): ServiceSubTypeRow | null {
  const raw = (subLabel || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const compact = compactKey(raw);

  const pick = (items: ServiceSubTypeRow[]) => {
    for (const st of items) {
      if (st.label.toLowerCase() === lower) return st;
      if (compactKey(st.label) === compact) return st;
      if (st.aliases.some((a) => a.toLowerCase() === lower)) return st;
    }
    return null;
  };

  const active = catalog.subTypes.filter((st) => st.active);
  return pick(active) ?? pick(catalog.subTypes.filter((st) => !st.active));
}

export function resolveDefaultLeadCostFromCatalog(
  catalog: LeadCatalog,
  leadSource: string,
  serviceSubType?: string,
  serviceSubTypeCustom?: string
): string {
  const source = findSource(catalog, leadSource);
  const subLabel = resolveSubTypeLabel(serviceSubType, serviceSubTypeCustom);
  const subType = subLabel ? findSubType(catalog, subLabel) : null;

  if (source) {
    const forSource = catalog.rules.filter((r) => r.lead_source_id === source.id);
    const ranked = [...forSource].sort((a, b) => {
      const aSpecific =
        subType && a.service_sub_type_id === subType.id ? 0 : a.service_sub_type_id ? 2 : 1;
      const bSpecific =
        subType && b.service_sub_type_id === subType.id ? 0 : b.service_sub_type_id ? 2 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      return b.priority - a.priority;
    });
    const best = ranked[0];
    if (best) return String(best.cost_inr);
    return String(source.default_cost_inr);
  }

  return legacyDefaultLeadCostString(leadSource, subLabel);
}

export function leadSourceRequiresOtpFromCatalog(
  catalog: LeadCatalog,
  leadSource: string
): boolean {
  const source = findSource(catalog, leadSource);
  if (source) return source.requires_otp;
  const s = (leadSource || '').trim().toLowerCase();
  return s.startsWith('home triangle');
}

export function getActiveLeadSourceOptions(catalog: LeadCatalog): LeadSourceRow[] {
  return [...catalog.sources].filter((s) => s.active).sort((a, b) => a.sort_order - b.sort_order);
}

export function getActiveSubTypeOptions(catalog: LeadCatalog): ServiceSubTypeRow[] {
  return [...catalog.subTypes].filter((s) => s.active).sort((a, b) => a.sort_order - b.sort_order);
}

export function getLeadSourceOptionsForFilters(catalog: LeadCatalog | null): string[] {
  const base = catalog
    ? getActiveLeadSourceOptions(catalog).map((s) => s.label)
    : [...LEGACY_LEAD_SOURCE_LABELS];
  return base;
}

export function getSubTypeOptionsForFilters(catalog: LeadCatalog | null): string[] {
  const base = catalog
    ? getActiveSubTypeOptions(catalog).map((s) => s.label)
    : [...LEGACY_SERVICE_SUB_TYPE_LABELS];
  return base;
}

function legacyDefaultLeadCostString(leadSource: string, subLabel: string): string {
  const src = leadSource.trim().toLowerCase();
  const sub = subLabel.trim().toLowerCase();
  if (src.startsWith('home triangle') && (sub === 'installation' || sub === 'reinstallation')) {
    return '116';
  }
  return String(legacyDefaultCostOnly(leadSource));
}

/** Sync helper — uses cache if loaded, else legacy hardcoded rules. */
export function getDefaultLeadCost(
  leadSource: string,
  serviceSubType?: string,
  serviceSubTypeCustom?: string
): string {
  const catalog = peekLeadCatalog();
  if (catalog) {
    return resolveDefaultLeadCostFromCatalog(
      catalog,
      leadSource,
      serviceSubType,
      serviceSubTypeCustom
    );
  }
  return legacyDefaultLeadCostString(
    leadSource,
    resolveSubTypeLabel(serviceSubType, serviceSubTypeCustom)
  );
}

export function isHomeTriangleLeadSource(leadSource: string | undefined | null): boolean {
  const catalog = peekLeadCatalog();
  if (catalog) return leadSourceRequiresOtpFromCatalog(catalog, leadSource || '');
  const s = (leadSource || '').trim().toLowerCase();
  return s.startsWith('home triangle');
}

export function isLeadSourceRequiresOtp(leadSource: string | undefined | null): boolean {
  return isHomeTriangleLeadSource(leadSource);
}

export function isLeadSourceAllowCustomText(leadSource: string | undefined | null): boolean {
  const catalog = peekLeadCatalog();
  if (catalog) {
    const source = findSource(catalog, leadSource || '');
    if (source) return source.allow_custom_text;
  }
  return (leadSource || '').trim() === 'Other';
}

export function isServiceSubTypeAllowCustomText(subType: string | undefined | null): boolean {
  const catalog = peekLeadCatalog();
  if (catalog) {
    const st = findSubType(catalog, subType || '');
    if (st) return st.allow_custom_text;
  }
  const s = (subType || '').trim();
  return s === 'Other' || s === 'Custom';
}

export function leadSourceValueForSave(label: string, custom?: string): string {
  if (isLeadSourceAllowCustomText(label)) {
    return (custom || '').trim() || label;
  }
  return label;
}

/** Map stored job lead_source text → form select label + optional custom. */
export function resolveLeadSourceForForm(
  storedSource: string,
  storedCustom?: string
): { label: string; custom: string } {
  const raw = (storedSource || '').trim();
  const custom = (storedCustom || '').trim();
  if (!raw) return { label: '', custom };

  const catalog = peekLeadCatalog();
  if (catalog) {
    const source = findSource(catalog, raw);
    if (source) {
      if (source.allow_custom_text) {
        return {
          label: source.label,
          custom: custom || (raw.toLowerCase() !== source.label.toLowerCase() ? raw : ''),
        };
      }
      return { label: source.label, custom: '' };
    }
  }

  if (raw.toLowerCase().startsWith('website (')) {
    return { label: 'Website', custom: '' };
  }

  return { label: raw, custom };
}

/** Preload on admin dashboard — one RPC per session. */
export function preloadLeadCatalog(): void {
  if (isLeadCatalogCached()) return;
  void ensureLeadCatalogLoaded().catch(() => {
    /* soft-fail; legacy fallback */
  });
}
