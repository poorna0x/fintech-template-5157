import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getAmcDocumentBrandLabel } from '@/lib/amc-brand';

interface AmcServiceBrandBadgeProps {
  amc: { service_brand?: unknown; additional_info?: unknown };
  className?: string;
}

export default function AmcServiceBrandBadge({ amc, className }: AmcServiceBrandBadgeProps) {
  const label = getAmcDocumentBrandLabel(amc);
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
