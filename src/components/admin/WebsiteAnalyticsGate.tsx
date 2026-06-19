import { lazy, Suspense, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Loader2 } from 'lucide-react';

const WebsiteAnalyticsCard = lazy(() =>
  import('./WebsiteAnalyticsCard').then((m) => ({ default: m.WebsiteAnalyticsCard }))
);

/** Lightweight shell — heavy analytics UI + Supabase fetch mount only after click. */
export function WebsiteAnalyticsGate() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card id="section-website-analytics">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <BarChart3 className="w-5 h-5 shrink-0" />
            Website analytics
          </CardTitle>
          <CardDescription className="text-sm mt-1 max-w-2xl">
            Visitors, calls, and bookings on hydrogenro.com and elevenro.com (IST). Loads on demand
            so Settings opens faster.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Load website analytics
          </Button>
        </CardContent>
      </Card>
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
