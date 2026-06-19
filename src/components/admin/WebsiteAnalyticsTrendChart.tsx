import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ChartMetricKey, TrendPoint } from './websiteAnalyticsTypes';

const chartConfig = {
  visitors: { label: 'Visitors', color: 'hsl(199 89% 48%)' },
  phone_clicks: { label: 'Calls', color: 'hsl(142 71% 45%)' },
  booking_submits: { label: 'Bookings', color: 'hsl(262 83% 58%)' },
} satisfies ChartConfig;

type MetricKey = ChartMetricKey;

export default function WebsiteAnalyticsTrendChart({
  data,
  metric,
}: {
  data: TrendPoint[];
  metric: MetricKey;
}) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No trend data for this period.
      </div>
    );
  }

  const ordered = [...data].sort((a, b) => a.day.localeCompare(b.day));
  const tickInterval = ordered.length > 14 ? Math.ceil(ordered.length / 7) : 0;

  return (
    <ChartContainer config={chartConfig} className="h-44 sm:h-52 w-full min-w-[280px] aspect-auto">
      <BarChart data={ordered} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={tickInterval || 'preserveStartEnd'}
          minTickGap={16}
          tick={{ fontSize: 11 }}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as TrendPoint | undefined;
                return row?.day
                  ? new Date(`${row.day}T12:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '';
              }}
            />
          }
        />
        <Bar
          dataKey={metric}
          fill={`var(--color-${metric})`}
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
      </BarChart>
    </ChartContainer>
  );
}
