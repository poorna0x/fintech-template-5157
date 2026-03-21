import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { Plus, Edit } from 'lucide-react';

interface RecentAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onNewJob: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
}

const RecentAccountsDialog: React.FC<RecentAccountsDialogProps> = ({
  open,
  onOpenChange,
  customers,
  onNewJob,
  onEditCustomer
}) => {
  const todayCustomers = customers
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
          {todayCustomers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No accounts created today.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {customer.customer_id || (customer as any).customerId}
                        </span>
                        <Badge variant="outline" className={`text-xs ${customerNameClassName(customer)}`}>
                          {customer.fullName || customer.full_name}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
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
                        <p className="text-xs text-gray-500">
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

