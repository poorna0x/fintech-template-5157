import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SettingsActionCardProps = {
  title: string;
  description?: string;
  icon: ReactNode;
  actions: ReactNode;
  /** Deep-link anchor: renders as id="section-{sectionId}" with scroll margin */
  sectionId?: string;
};

/** Settings section card — title/description left, actions right on desktop (matches Analytics). */
export function SettingsActionCard({ title, description, icon, actions, sectionId }: SettingsActionCardProps) {
  return (
    <Card
      id={sectionId ? `section-${sectionId}` : undefined}
      className={sectionId ? 'scroll-mt-24' : undefined}
    >
      <CardHeader className="space-y-0 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="space-y-1.5 flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <span className="flex shrink-0 text-foreground [&>svg]:w-5 [&>svg]:h-5">{icon}</span>
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="text-sm leading-relaxed max-w-2xl">{description}</CardDescription>
            ) : null}
          </div>
          <div className="hidden sm:flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:hidden">
        <div className="flex flex-col gap-2">{actions}</div>
      </CardContent>
    </Card>
  );
}
