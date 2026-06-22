import { lazy, Suspense, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, Loader2 } from 'lucide-react';
import { AnalyticsLoadSection } from '@/components/admin/AnalyticsLoadSection';

const WebsiteAnalyticsCard = lazy(() =>
  import('./WebsiteAnalyticsCard').then((m) => ({ default: m.WebsiteAnalyticsCard }))
);

/** Lightweight shell — heavy analytics UI + Supabase fetch mount only after click. */
export function WebsiteAnalyticsGate() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <AnalyticsLoadSection
        id="section-website-analytics"
        title="Public marketing analytics"
        description="Public customer visits on hydrogenro.com and elevenro.com (IST). Excludes CRM apps, staff sessions, internal QR pages, and bots. Uses its own date and site filters — not the dashboard Period selector above."
        icon={<BarChart3 />}
        loadLabel="Load website analytics"
        loadingLabel="Loading website analytics…"
        onLoad={() => setOpen(true)}
        loaded={false}
        emptyHint="Load public marketing visitor, call, and booking analytics (customer traffic only)."
      />
    );
  }

  return (
    <Suspense
      fallback={
        <Card id="section-website-analytics">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading website analytics…
          </CardContent>
        </Card>
      }
    >
      <WebsiteAnalyticsCard />
    </Suspense>
  );
}
