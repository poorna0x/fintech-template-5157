import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/supabase';
import { inventoryCache } from '@/lib/inventoryCache';
import { filterInventoryByApproxSearch } from '@/lib/inventorySearch';
import { getInventoryBillName } from '@/lib/inventoryBillName';
import { cn } from '@/lib/utils';

export type CatalogSlimItem = {
  id: string;
  product_name: string;
  full_name?: string | null;
  code?: string | null;
};

const CATALOG_CACHE_KEY = 'document_inventory_catalog_v2';

let catalogMemory: CatalogSlimItem[] | null = null;
let catalogLoadPromise: Promise<CatalogSlimItem[]> | null = null;

async function loadCatalogSlim(): Promise<CatalogSlimItem[]> {
  if (catalogMemory) return catalogMemory;
  const cached = inventoryCache.get<CatalogSlimItem[]>(CATALOG_CACHE_KEY);
  if (cached && cached.length > 0) {
    catalogMemory = cached;
    return cached;
  }
  if (!catalogLoadPromise) {
    catalogLoadPromise = db.inventory
      .getCatalogSlim()
      .then(({ data, error }) => {
        if (error) {
          console.error('Inventory catalog load failed', error);
          // Do not cache empty on error (e.g. missing full_name column before migration)
          return [] as CatalogSlimItem[];
        }
        const rows = (data || []) as CatalogSlimItem[];
        catalogMemory = rows;
        if (rows.length > 0) {
          inventoryCache.set(CATALOG_CACHE_KEY, rows);
        }
        return rows;
      })
      .finally(() => {
        catalogLoadPromise = null;
      });
  }
  return catalogLoadPromise;
}

/** Invalidate in-memory catalog after inventory CRUD (optional callers). */
export function invalidateDocumentInventoryCatalog() {
  catalogMemory = null;
  inventoryCache.clear(CATALOG_CACHE_KEY);
}

interface InventoryItemSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Free-text description field with inventory typeahead.
 * Selecting a catalog row fills full_name || product_name; does not set price.
 */
export default function InventoryItemSearchField({
  value,
  onChange,
  placeholder = 'Item description or search inventory…',
  id,
  className,
  disabled,
}: InventoryItemSearchFieldProps) {
  const [catalog, setCatalog] = useState<CatalogSlimItem[]>(catalogMemory || []);
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipOpenOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadCatalogSlim().then((rows) => {
      if (!cancelled) setCatalog(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const matches = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q || q.length < 1) return [];
    return filterInventoryByApproxSearch(catalog, q).slice(0, 12);
  }, [catalog, debouncedQuery]);

  const showList = open && !disabled && matches.length > 0;

  const handlePick = useCallback(
    (item: CatalogSlimItem) => {
      skipOpenOnce.current = true;
      onChange(getInventoryBillName(item));
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          if (skipOpenOnce.current) {
            skipOpenOnce.current = false;
            return;
          }
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {showList && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {matches.map((item) => {
            const billName = getInventoryBillName(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(item)}
                >
                  <span className="text-sm font-medium text-slate-900 truncate w-full">
                    {billName}
                  </span>
                  <span className="text-xs text-slate-500 truncate w-full">
                    {item.full_name?.trim() && item.product_name !== item.full_name.trim()
                      ? `${item.product_name}${item.code ? ` · ${item.code}` : ''}`
                      : item.code
                        ? `Code: ${item.code}`
                        : 'Inventory'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
