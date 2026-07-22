import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Loader2, MapPin, Phone, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { notifyAdminsTechnicianSearch } from '@/lib/technicianSearchAlert';

/** Slim customer row from technician_search_customers RPC (snake_case). */
export type TechnicianSearchCustomer = Record<string, unknown> & {
  id: string;
  customer_id?: string;
  full_name?: string;
  phone?: string;
  alternate_phone?: string;
  visible_address?: string;
  address?: { area?: string; city?: string } | null;
  brand?: string;
  model?: string;
};

type TechnicianCustomerSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewReport: (customer: TechnicianSearchCustomer) => void;
  onNewJob: (customer: TechnicianSearchCustomer) => void;
};

function customerAreaLabel(c: TechnicianSearchCustomer): string {
  const parts = [
    c.visible_address,
    (c.address as { area?: string } | null)?.area,
    (c.address as { city?: string } | null)?.city,
  ].filter((v): v is string => Boolean(v && String(v).trim()));
  return parts.slice(0, 2).join(', ');
}

const TechnicianCustomerSearchDialog = ({
  open,
  onOpenChange,
  onViewReport,
  onNewJob,
}: TechnicianCustomerSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TechnicianSearchCustomer[] | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = async (rawQuery?: string) => {
    const trimmed = (rawQuery ?? query).trim();
    if (trimmed.length < 3) {
      toast.error('Type at least 3 characters (name or phone)');
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await db.customers.searchAsTechnician(trimmed);
      if (error) {
        toast.error('Search failed');
        setResults([]);
      } else {
        const rows = (data as TechnicianSearchCustomer[]) || [];
        setResults(rows);
        // Silent admin ping when the search actually found someone — includes
        // the query string. Technician sees nothing.
        if (rows.length > 0) {
          notifyAdminsTechnicianSearch(trimmed, rows.length);
        }
      }
    } finally {
      setSearching(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setResults(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Customer</DialogTitle>
          <DialogDescription>
            Find a customer by name or phone to view their report or create a job.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
            placeholder="Name or phone number"
            inputMode="search"
            autoFocus
          />
          <Button onClick={() => void runSearch()} disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {results !== null && results.length === 0 && !searching && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No customers found.
          </p>
        )}

        {results && results.length > 0 && (
          <div className="space-y-3">
            {results.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.full_name || 'Customer'}
                      {c.customer_id ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {c.customer_id}
                        </span>
                      ) : null}
                    </p>
                    {c.phone && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {c.phone}
                      </p>
                    )}
                    {customerAreaLabel(c) && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customerAreaLabel(c)}</span>
                      </p>
                    )}
                    {(c.brand || c.model) && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[c.brand, c.model].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onViewReport(c)}
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    Report
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => onNewJob(c)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Job
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianCustomerSearchDialog;
