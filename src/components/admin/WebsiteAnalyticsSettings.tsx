import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { WebsiteAnalyticsDataDelete } from '@/components/admin/WebsiteAnalyticsDataDelete';

type WebsiteAnalyticsSettingsProps = {
  disabled?: boolean;
  disabledTitle?: string;
};

/** Settings page wrapper — delete UI is shared with Analytics → Website analytics. */
export function WebsiteAnalyticsSettings({
  disabled: _disabled,
  disabledTitle: _disabledTitle,
}: WebsiteAnalyticsSettingsProps) {
  return (
    <Card id="section-website-analytics-data">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <BarChart3 className="w-5 h-5 shrink-0" />
          Website analytics data
        </CardTitle>
        <CardDescription className="text-sm mt-1 max-w-2xl">
          Remove visitor and conversion events. All times are IST. Cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <WebsiteAnalyticsDataDelete />
      </CardContent>
    </Card>
  );
}
