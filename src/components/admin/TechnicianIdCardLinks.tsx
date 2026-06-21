import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { getTechnicianIdCardUrl, TECHNICIAN_ID_CARD_BRANDS } from '@/lib/technician-id-card';

interface TechnicianIdCardLinksProps {
  technicianId: string;
  /** Show Open link (e.g. after creating a technician). */
  showOpen?: boolean;
}

export function TechnicianIdCardLinks({ technicianId, showOpen }: TechnicianIdCardLinksProps) {
  return (
    <div className="space-y-2">
      {TECHNICIAN_ID_CARD_BRANDS.map((brand) => {
        const url = getTechnicianIdCardUrl(technicianId, brand);
        const label = getDocumentBrandLabel(brand);
        const isEleven = brand === 'elevenro';

        return (
          <div
            key={brand}
            className={
              isEleven
                ? 'rounded-lg border border-violet-200 bg-violet-50/80 p-2 dark:border-violet-800 dark:bg-violet-950/30'
                : 'rounded-lg border border-blue-200 bg-blue-50/80 p-2 dark:border-blue-800 dark:bg-blue-950/30'
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={
                    isEleven
                      ? 'mb-1 text-xs font-medium text-violet-900 dark:text-violet-200'
                      : 'mb-1 text-xs font-medium text-blue-900 dark:text-blue-200'
                  }
                >
                  {label} ID card
                </p>
                <p
                  className={
                    isEleven
                      ? 'truncate font-mono text-xs text-violet-700 dark:text-violet-300'
                      : 'truncate font-mono text-xs text-blue-700 dark:text-blue-300'
                  }
                >
                  {url}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success(`${label} ID card link copied`);
                  }}
                  className="h-8 w-8 p-0"
                  title={`Copy ${label} link`}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                {showOpen ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                    className="h-8 w-8 p-0"
                    title={`Open ${label} ID card`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
