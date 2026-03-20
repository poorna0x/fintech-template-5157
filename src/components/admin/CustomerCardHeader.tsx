import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Edit, Plus, Camera, FileText, MoreVertical, Receipt, Star, Bell } from 'lucide-react';
import { Customer } from '@/types';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';

interface CustomerCardHeaderProps {
  customer: Customer;
  customerAMCStatus: Record<string, boolean>;
  isLoadingPhotos: boolean;
  selectedCustomerForPhotos: Customer | null;
  moreOptionsDialogOpen: Record<string, boolean>;
  onEditCustomer: (customer: Customer) => void;
  onNewJob: (customer: Customer) => void;
  onViewPhotos: (customer: Customer) => void;
  onGenerateBill: (customer: Customer) => void;
  onGenerateQuotation: (customer: Customer) => void;
  onGenerateAMC: (customer: Customer) => void;
  onGenerateTaxInvoice: (customer: Customer) => void;
  onSetSelectedCustomerForReport: (customer: Customer) => void;
  onSetCustomerReportDialogOpen: (open: boolean) => void;
  onSetMoreOptionsDialogOpen: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onViewAMCInfo?: (customer: Customer) => void;
  onAddReminder?: (customer: Customer) => void;
  onViewReminders?: (customer: Customer) => void;
}

export const CustomerCardHeader: React.FC<CustomerCardHeaderProps> = ({
  customer,
  customerAMCStatus,
  isLoadingPhotos,
  selectedCustomerForPhotos,
  moreOptionsDialogOpen,
  onEditCustomer,
  onNewJob,
  onViewPhotos,
  onGenerateBill,
  onGenerateQuotation,
  onGenerateAMC,
  onGenerateTaxInvoice,
  onSetSelectedCustomerForReport,
  onSetCustomerReportDialogOpen,
  onSetMoreOptionsDialogOpen,
  onViewAMCInfo,
  onAddReminder,
  onViewReminders,
}) => {
  const hasGoogleReview = customer.has_google_review === true || (customer as any).has_google_review === 'true';

  return (
    <div className="bg-gray-50 p-4 border-b border-gray-200">
      {/* Mobile Customer Info */}
      <div className="mb-4 sm:hidden">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-6 h-6 ${
            customerAMCStatus[customer.id] && hasGoogleReview
              ? 'bg-orange-500 ring-2 ring-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.9)]'
              : customerAMCStatus[customer.id]
                ? 'bg-green-500'
                : (hasGoogleReview ? 'bg-red-500' : 'bg-gray-600')
          } rounded-sm flex items-center justify-center relative`}>
            <div className="w-3 h-3 bg-white rounded-sm"></div>
            {customerAMCStatus[customer.id] && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
            )}
            {hasGoogleReview && customerAMCStatus[customer.id] ? (
              <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-orange-600 rounded-full border border-white" title="Google reviewed"></div>
            ) : hasGoogleReview ? (
              <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-red-600 rounded-full border border-white" title="Google reviewed"></div>
            ) : null}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 truncate flex-1">
            {customer.fullName || 'Unknown Customer'}
          </h3>
          <div className="bg-gray-800 text-white px-2 py-1 rounded-md font-mono text-xs font-medium">
            {customer.customerId || 'N/A'}
          </div>
        </div>
      </div>

      {/* Action Buttons - Mobile Grid */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
          onClick={() => onEditCustomer(customer)}
        >
          <Edit className="w-4 h-4" />
          Edit Profile
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
          onClick={() => onNewJob(customer)}
        >
          <Plus className="w-4 h-4" />
          New Job
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
          onClick={() => onViewPhotos(customer)}
          disabled={isLoadingPhotos}
        >
          {isLoadingPhotos && selectedCustomerForPhotos?.customer_id === (customer.customer_id || customer.customerId) ? (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          ) : (
            <Camera className="w-4 h-4" />
          )}
          Photos
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
          onClick={() => {
            onSetSelectedCustomerForReport(customer);
            onSetCustomerReportDialogOpen(true);
          }}
        >
          <FileText className="w-4 h-4" />
          Reports
        </Button>
        
        {/* Mobile More Options Button - Opens Dialog */}
        <div className="col-span-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
            onClick={() => {
              onSetMoreOptionsDialogOpen(prev => ({
                ...prev,
                [customer.id]: true
              }));
            }}
          >
            <MoreVertical className="w-4 h-4" />
            More Options
          </Button>
          
          {/* More Options Dialog */}
          <Dialog 
            open={moreOptionsDialogOpen[customer.id] || false}
            onOpenChange={(open) => {
              onSetMoreOptionsDialogOpen(prev => ({
                ...prev,
                [customer.id]: open
              }));
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>More Options</DialogTitle>
                <DialogDescription>
                  Choose an action for {customer.fullName || 'this customer'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 min-h-[44px]"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onAddReminder?.(customer);
                  }}
                >
                  <Bell className="mr-3 h-5 w-5 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Add reminder</div>
                    <div className="text-xs text-muted-foreground">Add a reminder for this customer</div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 min-h-[44px]"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onViewReminders?.(customer);
                  }}
                >
                  <Bell className="mr-3 h-5 w-5 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">View reminders</div>
                    <div className="text-xs text-muted-foreground">See and edit reminders for this customer</div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 min-h-[44px]"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onGenerateBill(customer);
                  }}
                >
                  <Receipt className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Generate Bill</div>
                    <div className="text-xs text-muted-foreground">Create a bill for this customer</div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onGenerateQuotation(customer);
                  }}
                >
                  <FileText className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Generate Quotation</div>
                    <div className="text-xs text-muted-foreground">Create a quotation for this customer</div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onGenerateAMC(customer);
                  }}
                >
                  <Star className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Generate AMC</div>
                    <div className="text-xs text-muted-foreground">Create full AMC or share terms only</div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4"
                  onClick={() => {
                    onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                    onGenerateTaxInvoice(customer);
                  }}
                >
                  <Receipt className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Generate Tax Invoice</div>
                    <div className="text-xs text-muted-foreground">Create a tax invoice with GST for this customer</div>
                  </div>
                </Button>
                {customerAMCStatus[customer.id] && onViewAMCInfo && (
                  <Button 
                    variant="outline"
                    className="w-full justify-start h-auto py-3 px-4 text-green-700 hover:text-green-800 hover:bg-green-50"
                    onClick={() => {
                      onSetMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                      onViewAMCInfo(customer);
                    }}
                  >
                    <Star className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">AMC Info</div>
                      <div className="text-xs text-muted-foreground">View active AMC contract details</div>
                    </div>
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Desktop Layout - Customer Info and Action Buttons in Same Row */}
      <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Customer Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 ${
                customerAMCStatus[customer.id] && hasGoogleReview
                  ? 'bg-orange-500 ring-2 ring-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.9)]'
                  : customerAMCStatus[customer.id]
                    ? 'bg-green-500'
                    : (hasGoogleReview ? 'bg-red-500' : 'bg-gray-600')
              } rounded-sm flex items-center justify-center relative`}>
                <div className="w-2 h-2 bg-white rounded-sm"></div>
                {customerAMCStatus[customer.id] && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                )}
                {hasGoogleReview && customerAMCStatus[customer.id] ? (
                  <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-orange-600 rounded-full border border-white" title="Google reviewed"></div>
                ) : hasGoogleReview ? (
                  <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-red-600 rounded-full border border-white" title="Google reviewed"></div>
                ) : null}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 truncate">
                {customer.fullName || 'Unknown Customer'}
              </h3>
              <div className="bg-gray-800 text-white px-2 py-1 rounded-md font-mono text-sm font-medium">
                {customer.customerId || 'N/A'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Desktop Action Buttons */}
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
            onClick={() => onEditCustomer(customer)}
          >
            <Edit className="w-3 h-3" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
            onClick={() => onNewJob(customer)}
          >
            <Plus className="w-3 h-3" />
            Job
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
            onClick={() => onViewPhotos(customer)}
            disabled={isLoadingPhotos}
          >
            {isLoadingPhotos && selectedCustomerForPhotos?.customer_id === (customer.customer_id || customer.customerId) ? (
              <div className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            ) : (
              <Camera className="w-3 h-3" />
            )}
            Photos
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
            onClick={() => {
              onSetSelectedCustomerForReport(customer);
              onSetCustomerReportDialogOpen(true);
            }}
          >
            <FileText className="w-3 h-3" />
            Reports
          </Button>
          
          {/* Desktop 3 Dots Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
              >
                <MoreVertical className="w-3 h-3" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAddReminder?.(customer)}>
                <Bell className="mr-2 h-4 w-4" />
                Add reminder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewReminders?.(customer)}>
                <Bell className="mr-2 h-4 w-4" />
                View reminders
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerateBill(customer)}>
                <Receipt className="mr-2 h-4 w-4" />
                Generate Bill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerateQuotation(customer)}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Quotation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerateAMC(customer)}>
                <Star className="mr-2 h-4 w-4" />
                Generate AMC / Share Terms
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerateTaxInvoice(customer)}>
                <Receipt className="mr-2 h-4 w-4" />
                Generate Tax Invoice
              </DropdownMenuItem>
              {customerAMCStatus[customer.id] && onViewAMCInfo && (
                <DropdownMenuItem 
                  onClick={() => onViewAMCInfo(customer)}
                  className="text-green-700 focus:text-green-800 focus:bg-green-50"
                >
                  <Star className="mr-2 h-4 w-4" />
                  AMC Info
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

