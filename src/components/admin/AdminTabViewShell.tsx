import React, { Suspense } from 'react';
import AdminHeader from '@/components/AdminHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { AdminInlineLoader } from './AdminLoaders';

type AdminTabViewShellProps = {
  loadingMessage: string;
  onBack: () => void;
  onLogoClick?: () => void;
  children: React.ReactNode;
};

export function AdminTabViewShell({ loadingMessage, onBack, onLogoClick, children }: AdminTabViewShellProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader onLogoClick={onLogoClick} />
      <div className="container mx-auto px-4 py-4 sm:py-8">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Suspense fallback={<AdminInlineLoader message={loadingMessage} />}>{children}</Suspense>
      </div>
    </div>
  );
}
