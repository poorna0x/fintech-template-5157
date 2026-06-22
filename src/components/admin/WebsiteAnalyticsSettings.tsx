import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { WebsiteAnalyticsDataDelete } from '@/components/admin/WebsiteAnalyticsDataDelete';
import { WebsiteAnalyticsGate } from '@/components/admin/WebsiteAnalyticsGate';

type WebsiteAnalyticsSettingsProps = {
  disabled?: boolean;
  disabledTitle?: string;
};

/** Settings — view website analytics inline; delete raw event data below. */
export function WebsiteAnalyticsSettings({
  disabled: _disabled,
  disabledTitle: _disabledTitle,
}: WebsiteAnalyticsSettingsProps) {
  return (
    <div id="section-website-analytics-data" className="space-y-6 scroll-mt-24">
      <WebsiteAnalyticsGate />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Trash2 className="w-5 h-5 shrink-0" />
            Delete analytics data
          </CardTitle>
          <CardDescription className="text-sm mt-1 max-w-2xl">
            Remove visitor and conversion events. All times are IST. Cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <WebsiteAnalyticsDataDelete />
        </CardContent>
      </Card>
    </div>
  );
}
