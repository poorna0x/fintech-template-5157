import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, RefreshCw } from 'lucide-react';
import { db } from '@/lib/supabase';
import { getPublicSiteLabel, type PublicSiteKey } from '@/lib/websiteSiteKey';
import { toast } from 'sonner';

type SiteDayStats = {
  site_key: PublicSiteKey;
  visitors: number;
  page_views: number;
  phone_clicks: number;
  whatsapp_clicks: number;
  booking_clicks: number;
  booking_submits: number;
};

type DailyRow = SiteDayStats & { day: string };

type Summary = {
  today: SiteDayStats[];
  daily: DailyRow[];
  days: number;
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function SiteTodayBlock({ row }: { row: SiteDayStats }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{getPublicSiteLabel(row.site_key)}</Badge>
        <span className="text-xs text-muted-foreground">Today (IST)</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label="Visitors" value={row.visitors} />
        <Stat label="Page views" value={row.page_views} />
        <Stat label="Calls" value={row.phone_clicks} />
        <Stat label="WhatsApp" value={row.whatsapp_clicks} />
        <Stat label="Book clicks" value={row.booking_clicks} />
        <Stat label="Bookings" value={row.booking_submits} />
      </div>
    </div>
  );
}

export function WebsiteAnalyticsCard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db.websiteAnalytics.getSummary(14);
      if (error) throw error;
      setSummary((data as Summary) || null);
    } catch (e) {
      console.error(e);
      toast.error('Could not load website analytics. Run scripts/add-website-analytics.sql in Supabase.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const last7 = useMemo(() => {
    if (!summary?.daily?.length) return [];
    const bySite = new Map<PublicSiteKey, SiteDayStats>();
    for (const row of summary.daily) {
      const key = row.site_key;
      const prev = bySite.get(key) || {
        site_key: key,
        visitors: 0,
        page_views: 0,
        phone_clicks: 0,
        whatsapp_clicks: 0,
        booking_clicks: 0,
        booking_submits: 0,
      };
      bySite.set(key, {
        site_key: key,
        visitors: prev.visitors + Number(row.visitors || 0),
        page_views: prev.page_views + Number(row.page_views || 0),
        phone_clicks: prev.phone_clicks + Number(row.phone_clicks || 0),
        whatsapp_clicks: prev.whatsapp_clicks + Number(row.whatsapp_clicks || 0),
        booking_clicks: prev.booking_clicks + Number(row.booking_clicks || 0),
        booking_submits: prev.booking_submits + Number(row.booking_submits || 0),
      });
    }
    return [...bySite.values()];
  }, [summary]);

  return (
    <Card id="section-website-analytics">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <BarChart3 className="w-5 h-5" />
          Website analytics
        </CardTitle>
        <CardDescription className="text-sm mt-1">
          First-party visitor and contact stats for Hydrogen RO and Eleven RO (today + last 14 days, IST).
          Call counts are button taps, not confirmed phone conversations.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loading && !summary ? (
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        ) : !summary?.today?.length && !summary?.daily?.length ? (
          <p className="text-sm text-muted-foreground">
            No events yet. Data appears after visitors use hydrogenro.com or elevenro.com.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {(summary.today?.length ? summary.today : [{ site_key: 'hydrogenro' as const, visitors: 0, page_views: 0, phone_clicks: 0, whatsapp_clicks: 0, booking_clicks: 0, booking_submits: 0 }]).map((row) => (
                <SiteTodayBlock key={row.site_key} row={row} />
              ))}
            </div>

            {last7.length > 0 ? (
              <div className="space-y-3 pt-2 border-t border-border">
                <h4 className="text-sm font-medium text-foreground">Last {summary?.days || 14} days (totals)</h4>
                {last7.map((row) => (
                  <div key={`7d-${row.site_key}`} className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <div className="col-span-3 sm:col-span-6">
                      <Badge variant="outline">{getPublicSiteLabel(row.site_key)}</Badge>
                    </div>
                    <Stat label="Visitors" value={row.visitors} />
                    <Stat label="Page views" value={row.page_views} />
                    <Stat label="Calls" value={row.phone_clicks} />
                    <Stat label="WhatsApp" value={row.whatsapp_clicks} />
                    <Stat label="Book clicks" value={row.booking_clicks} />
                    <Stat label="Bookings" value={row.booking_submits} />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
