import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart3,
  Clock,
  DollarSign,
  Lock,
  Mail,
  ListOrdered,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Star,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { settingsPath } from '@/lib/settingsSections';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import type { AdminDashboardView, AdminToolDialog } from '@/lib/adminDashboardUrl';

export type UnknownCallerChipProps = {
  phone: string;
  onSearch: () => void;
  onWhatsApp: () => void;
  onDismiss: () => void;
};

type AdminDashboardHeaderProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchPaste: React.ClipboardEventHandler<HTMLInputElement>;
  onSearchKeyPress: React.KeyboardEventHandler<HTMLInputElement>;
  onSearch: () => void;
  onClearSearch: () => void;
  isSearching: boolean;
  onManualRefresh: () => void;
  toolsMenuOpen: boolean;
  onToolsMenuOpenChange: (open: boolean) => void;
  onOpenAdminTool: (tool: AdminToolDialog) => void;
  onShowAmcView: () => void;
  isManager: boolean;
  managerRestrictedTitle: string;
  currentView: AdminDashboardView;
  onViewChange: (view: AdminDashboardView) => void;
  onAddCustomer: () => void;
  /** Admin APK only — unknown incoming caller within 3 min. */
  unknownCaller?: UnknownCallerChipProps | null;
};

function AdminSearchField({
  searchQuery,
  onSearchQueryChange,
  onSearchPaste,
  onSearchKeyPress,
  inputClassName,
}: Pick<
  AdminDashboardHeaderProps,
  'searchQuery' | 'onSearchQueryChange' | 'onSearchPaste' | 'onSearchKeyPress'
> & { inputClassName: string }) {
  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    const trimmed = e.target.value.trim();
    if (trimmed !== e.target.value) {
      onSearchQueryChange(trimmed);
    }
  };

  return (
    <div className="relative flex-1 min-w-[12rem]">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
      <Input
        placeholder="Search by customer ID, name, phone, alternate number, or email..."
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        onPaste={onSearchPaste}
        onBlur={handleBlur}
        onKeyPress={onSearchKeyPress}
        className={inputClassName}
      />
    </div>
  );
}

function UnknownCallerChip({
  phone,
  onSearch,
  onWhatsApp,
  onDismiss,
}: UnknownCallerChipProps) {
  return (
    <div
      className="w-full max-w-2xl rounded-lg border border-amber-200/90 bg-amber-50/90 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80 sm:text-xs">
            Incoming call · not in CRM
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground truncate">
            {phone}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground sm:hidden"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 flex-1 min-w-[7rem] border-amber-300 bg-white text-amber-950 hover:bg-amber-100/80 sm:flex-none sm:min-w-0"
          onClick={onSearch}
        >
          <Search className="mr-1.5 h-4 w-4 shrink-0" />
          Search
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 flex-1 min-w-[7rem] bg-green-600 text-white hover:bg-green-700 sm:flex-none sm:min-w-0"
          onClick={onWhatsApp}
        >
          <WhatsAppIcon className="mr-1.5 h-4 w-4 shrink-0" />
          WhatsApp
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-9 shrink-0 px-2 text-muted-foreground hover:text-foreground sm:inline-flex"
          onClick={onDismiss}
        >
          <X className="mr-1 h-4 w-4" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function AdminDashboardHeader({
  searchQuery,
  onSearchQueryChange,
  onSearchPaste,
  onSearchKeyPress,
  onSearch,
  onClearSearch,
  isSearching,
  onManualRefresh,
  toolsMenuOpen,
  onToolsMenuOpenChange,
  onOpenAdminTool,
  onShowAmcView,
  isManager,
  managerRestrictedTitle,
  currentView,
  onViewChange,
  onAddCustomer,
  unknownCaller,
}: AdminDashboardHeaderProps) {
  const navigate = useNavigate();

  const trimSearchOnBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    const trimmed = e.target.value.trim();
    if (trimmed !== e.target.value) {
      onSearchQueryChange(trimmed);
    }
  };

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="hidden sm:flex flex-1 max-w-2xl flex-col gap-2 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap" data-admin-search>
              <AdminSearchField
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchQueryChange}
                onSearchPaste={onSearchPaste}
                onSearchKeyPress={onSearchKeyPress}
                inputClassName="pl-10 h-9 bg-white border-gray-400 focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
              <Button
                onClick={onSearch}
                disabled={isSearching || !searchQuery.trim()}
                size="sm"
                className="h-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-3"
              >
                {isSearching ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="hidden md:inline text-xs sm:text-sm">Searching...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Search className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline text-sm">Search</span>
                  </div>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 shrink-0"
                title="Refresh data (no full page reload)"
                onClick={onManualRefresh}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              {searchQuery && (
                <Button onClick={onClearSearch} variant="outline" size="sm" className="h-9 px-2.5 shrink-0" title="Clear">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {unknownCaller ? <UnknownCallerChip {...unknownCaller} /> : null}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:flex-wrap">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                title="Settings"
                onClick={() => {
                  hapticTap();
                  navigate('/settings');
                }}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
              <DropdownMenu open={toolsMenuOpen} onOpenChange={onToolsMenuOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                    title="Tools"
                  >
                    <Wrench className="w-4 h-4" />
                    <span className="hidden sm:inline">Tools</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-52 data-[state=closed]:duration-75 data-[state=open]:duration-100 max-sm:data-[state=closed]:animate-none"
                >
                  <DropdownMenuItem onClick={() => onOpenAdminTool('recent-accounts')}>
                    <Clock className="w-4 h-4 mr-2" />
                    Recent Accounts
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      hapticTap();
                      onToolsMenuOpenChange(false);
                      navigate(settingsPath('calling', 'open'));
                    }}
                  >
                    <PhoneCall className="w-4 h-4 mr-2" />
                    Calling Page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      hapticTap();
                      onShowAmcView();
                    }}
                  >
                    <Star className="w-4 h-4 mr-2" />
                    View AMC
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isManager}
                    onClick={() => {
                      if (isManager) return;
                      onOpenAdminTool('direct-sale');
                    }}
                  >
                    {isManager ? <Lock className="w-4 h-4 mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                    Direct / Office Sales
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isManager}
                    onClick={() => {
                      if (isManager) return;
                      onOpenAdminTool('amount-trackers');
                    }}
                  >
                    {isManager ? <Lock className="w-4 h-4 mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                    Amount Trackers
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAdminTool('sent-email-log')}>
                    <Mail className="w-4 h-4 mr-2" />
                    Sent email log
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAdminTool('measure-distance')}>
                    <Navigation className="w-4 h-4 mr-2" />
                    Measure distance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAdminTool('arrange-visit-order')}>
                    <ListOrdered className="w-4 h-4 mr-2" />
                    Arrange visit order
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAdminTool('technician-live-location')}>
                    <MapPin className="w-4 h-4 mr-2" />
                    Technician location
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAdminTool('message-technician')}>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Message technician
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isManager}
                    onClick={() => {
                      if (isManager) return;
                      onToolsMenuOpenChange(false);
                      hapticTap();
                      navigate(settingsPath('technician-management'));
                    }}
                  >
                    {isManager ? <Lock className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                    Edit Technician
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant={currentView === 'payments' ? 'default' : 'outline'}
                onClick={() => onViewChange('payments')}
                disabled={isManager}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                title={isManager ? managerRestrictedTitle : 'Payments'}
              >
                {isManager ? <Lock className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                <span className="hidden sm:inline">Payments</span>
              </Button>
              <Button
                variant={currentView === 'billing' ? 'default' : 'outline'}
                onClick={() => onViewChange('billing')}
                disabled={isManager}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                title={isManager ? managerRestrictedTitle : 'Billing'}
              >
                {isManager ? <Lock className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                <span className="hidden sm:inline">Billing</span>
              </Button>
              <Button
                variant={currentView === 'analytics' ? 'default' : 'outline'}
                onClick={() => onViewChange('analytics')}
                disabled={isManager}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                title={isManager ? managerRestrictedTitle : 'Analytics'}
              >
                {isManager ? <Lock className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
                <span className="hidden sm:inline">Analytics</span>
              </Button>
              <Button
                variant={currentView === 'inventory' ? 'default' : 'outline'}
                onClick={() => onViewChange('inventory')}
                disabled={isManager}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                title={isManager ? managerRestrictedTitle : 'Inventory'}
              >
                {isManager ? <Lock className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                <span className="hidden sm:inline">Inventory</span>
              </Button>
            </div>

            <Button variant="brand" onClick={onAddCustomer} className="w-full sm:w-auto px-4 py-2 text-sm sm:text-base">
              <Users className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 sm:mb-6 sm:hidden" data-admin-search>
        <div className="flex flex-wrap gap-1.5 w-full max-w-2xl items-center">
          <div className="relative flex-1 min-w-0 basis-[min(100%,12rem)]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <Input
              placeholder="Search by customer ID, name, phone, alternate number, or email..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onPaste={onSearchPaste}
              onBlur={trimSearchOnBlur}
              onKeyPress={onSearchKeyPress}
              className="pl-10 h-9 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <Button
            onClick={onSearch}
            disabled={isSearching || !searchQuery.trim()}
            size="sm"
            className="h-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-2.5"
          >
            {isSearching ? (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2.5 shrink-0"
            title="Refresh data (no full page reload)"
            onClick={onManualRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          {searchQuery && (
            <Button onClick={onClearSearch} variant="outline" size="sm" className="h-9 px-2.5 shrink-0" title="Clear">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        {unknownCaller ? (
          <div className="mt-2 sm:hidden">
            <UnknownCallerChip {...unknownCaller} />
          </div>
        ) : null}
      </div>
    </>
  );
}
