import { useCallback, useEffect, useState } from 'react';
import {
  ensureLeadCatalogLoaded,
  getActiveLeadSourceOptions,
  getActiveSubTypeOptions,
  getDefaultLeadCost,
  isLeadCatalogFresh,
  isLeadSourceRequiresOtp,
  peekLeadCatalog,
  type LeadCatalog,
  type LeadSourceRow,
  type ServiceSubTypeRow,
} from '@/lib/leadCatalog';

export function useLeadCatalog(opts?: { includeInactive?: boolean }) {
  const [catalog, setCatalog] = useState<LeadCatalog | null>(() => peekLeadCatalog());
  const [loading, setLoading] = useState(() => !peekLeadCatalog());

  const reload = useCallback(async (force = false) => {
    const existing = peekLeadCatalog();
    if (!existing) setLoading(true);
    try {
      const next = await ensureLeadCatalogLoaded({
        force,
        includeInactive: opts?.includeInactive,
      });
      setCatalog(next);
    } catch {
      /* legacy fallback inside ensureLeadCatalogLoaded */
    } finally {
      setLoading(false);
    }
  }, [opts?.includeInactive]);

  useEffect(() => {
    const cached = peekLeadCatalog();
    if (cached && !opts?.includeInactive) {
      setCatalog(cached);
      setLoading(false);
      if (!isLeadCatalogFresh()) void reload();
      return;
    }
    void reload();
  }, [reload, opts?.includeInactive]);

  const sources: LeadSourceRow[] = catalog ? getActiveLeadSourceOptions(catalog) : [];
  const subTypes: ServiceSubTypeRow[] = catalog ? getActiveSubTypeOptions(catalog) : [];

  return {
    catalog,
    loading,
    sources,
    subTypes,
    reload,
    defaultLeadCost: (
      leadSource: string,
      serviceSubType?: string,
      serviceSubTypeCustom?: string
    ) => getDefaultLeadCost(leadSource, serviceSubType, serviceSubTypeCustom),
    requiresOtp: (leadSource: string) => isLeadSourceRequiresOtp(leadSource),
  };
}
