import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { Plus, Edit, Phone } from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';

export type UnknownCallerRowProps = {
  phone: string;
  onWhatsApp: () => void;
  onDismiss: () => void;
};

interface RecentAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  loading?: boolean;
  /** When true, render `customers` as-is (e.g. server-scoped fetch). Otherwise filter to today locally. */
  useCustomersAsIs?: boolean;
  onNewJob: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  /** Admin APK only — incoming number not in CRM (shown above today's list). */
  unknownCaller?: UnknownCallerRowProps | null;
}

const RecentAccountsDialog: React.FC<RecentAccountsDialogProps> = ({
  open,
  onOpenChange,
  customers,
  loading = false,
  useCustomersAsIs = false,
  onNewJob,
  onEditCustomer,
  unknownCaller = null,
}) => {
  const todayCustomers = useCustomersAsIs
    ? customers
    : customers
    .filter(customer => {
      const customerSince = customer.customer_since || (customer as any).customerSince;
      if (!customerSince) return false;
      const createdDate = new Date(customerSince);
      const today = new Date();
      return createdDate.toDateString() === today.toDateString();
    })
    .sort((a, b) => {
      const dateA = new Date(a.customer_since || (a as any).customerSince || 0);
      const dateB = new Date(b.customer_since || (b as any).customerSince || 0);
      return dateB.getTime() - dateA.getTime();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recent Accounts - Today</DialogTitle>
          <DialogDescription>
            All accounts created today ({new Date().toLocaleDateString()})
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {unknownCaller ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-100/80 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                    >
                      Not in CRM
                    </Badge>
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      {unknownCaller.phone}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                    Incoming call — send WhatsApp intro for location and filter photo.
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 flex-1 bg-green-600 text-white hover:bg-green-700 sm:flex-none sm:min-w-[7.5rem]"
                    onClick={unknownCaller.onWhatsApp}
                  >
                    <WhatsAppIcon className="mr-1.5 h-4 w-4 shrink-0" />
                    WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 sm:flex-none"
                    onClick={unknownCaller.onDismiss}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading…</p>
            </div>
          ) : todayCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{unknownCaller ? 'No other accounts created today.' : 'No accounts created today.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground">
                          {customer.customer_id || (customer as any).customerId}
                        </span>
                        <Badge variant="outline" className={`text-xs ${customerNameClassName(customer)}`}>
                          {customer.fullName || customer.full_name}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <span className="font-medium">Phone:</span> {customer.phone}
                          {customer.alternate_phone && ` / ${customer.alternate_phone}`}
                        </p>
                        <p>
                          <span className="font-medium">Email:</span> {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail') 
                            ? customer.email 
                            : 'nomail@mail'}
                        </p>
                        <p>
                          <span className="font-medium">Service:</span> {customer.service_type || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(customer.customer_since || (customer as any).customerSince || '').toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onNewJob(customer);
                          onOpenChange(false);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        New Job
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onEditCustomer(customer);
                          onOpenChange(false);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecentAccountsDialog;

