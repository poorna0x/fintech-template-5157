import React, { Suspense, lazy } from 'react';
import AdminHeader from '@/components/AdminHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminDashboardView, LetterheadDocumentType } from '@/lib/adminDashboardUrl';
import { AdminScreenLoader } from './AdminLoaders';
import { AdminTabViewShell } from './AdminTabViewShell';

const GSTInvoicesPage = lazy(() => import('../GSTInvoicesPage'));
const AMCViewPage = lazy(() => import('../AMCViewPage'));
const LetterheadDocumentsPage = lazy(() => import('../LetterheadDocumentsPage'));
const TechnicianPayments = lazy(() => import('../TechnicianPayments'));
const BillingStats = lazy(() => import('../BillingStats'));
const Analytics = lazy(() => import('../Analytics'));
const InventoryManagement = lazy(() => import('../InventoryManagement'));

export type AdminDashboardOverlayViewsProps = {
  showGSTInvoicesPage: boolean;
  gstInSubScreen: boolean;
  onHideGSTInvoices: () => void;
  onGstSubScreenChange: (inSub: boolean) => void;
  showAMCViewPage: boolean;
  onHideAMCView: () => void;
  onAMCDeleted: () => void;
  showLetterheadDocsPage: boolean;
  letterheadInitialType: LetterheadDocumentType | undefined;
  onLetterheadBack: () => void;
  currentView: AdminDashboardView;
  onViewChange: (view: AdminDashboardView) => void;
};

export function hasAdminDashboardOverlayView(props: AdminDashboardOverlayViewsProps): boolean {
  return (
    props.showGSTInvoicesPage ||
    props.showAMCViewPage ||
    props.showLetterheadDocsPage ||
    props.currentView !== 'dashboard'
  );
}

export default function AdminDashboardOverlayViews(props: AdminDashboardOverlayViewsProps) {
  if (props.showGSTInvoicesPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div
          className={cn(
            'container mx-auto px-3 sm:px-4',
            props.gstInSubScreen ? 'py-2' : 'py-3 sm:py-5'
          )}
        >
          {!props.gstInSubScreen ? (
            <div className="mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={props.onHideGSTInvoices}
                className="h-8 text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          ) : null}
          <Suspense fallback={<AdminScreenLoader message="Loading invoices..." />}>
            <GSTInvoicesPage onSubScreenChange={props.onGstSubScreenChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (props.showAMCViewPage) {
    return (
      <Suspense fallback={<AdminScreenLoader message="Loading AMC..." />}>
        <AMCViewPage onBack={props.onHideAMCView} onAMCDeleted={props.onAMCDeleted} />
      </Suspense>
    );
  }

  if (props.showLetterheadDocsPage) {
    return (
      <Suspense fallback={<AdminScreenLoader message="Loading documents builder..." />}>
        <LetterheadDocumentsPage
          initialType={props.letterheadInitialType}
          onBack={props.onLetterheadBack}
        />
      </Suspense>
    );
  }

  if (props.currentView === 'payments') {
    return (
      <AdminTabViewShell
        loadingMessage="Loading payments..."
        onBack={() => props.onViewChange('dashboard')}
      >
        <TechnicianPayments />
      </AdminTabViewShell>
    );
  }

  if (props.currentView === 'billing') {
    return (
      <AdminTabViewShell
        loadingMessage="Loading billing..."
        onBack={() => props.onViewChange('dashboard')}
      >
        <BillingStats />
      </AdminTabViewShell>
    );
  }

  if (props.currentView === 'analytics') {
    return (
      <AdminTabViewShell
        loadingMessage="Loading analytics..."
        onBack={() => props.onViewChange('dashboard')}
      >
        <Analytics />
      </AdminTabViewShell>
    );
  }

  if (props.currentView === 'inventory') {
    return (
      <AdminTabViewShell
        loadingMessage="Loading inventory..."
        onBack={() => props.onViewChange('dashboard')}
      >
        <InventoryManagement />
      </AdminTabViewShell>
    );
  }

  return null;
}
