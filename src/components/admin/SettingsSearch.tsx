import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BellPlus,
  Bug,
  ClipboardCheck,
  Database,
  Download,
  FileCheck,
  FileSignature,
  FileText,
  GitMerge,
  IndianRupee,
  ListTodo,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Package,
  PhoneCall,
  QrCode,
  Receipt,
  Repeat,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tags,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { WhatsAppLogo } from '@/components/whatsapp/WhatsAppLogo';
import { scrollToSettingsSection } from '@/lib/settingsSectionScroll';
import type { SettingsPanelSlug } from '@/lib/settingsUrl';

type SearchDestination =
  | { type: 'panel'; panel: SettingsPanelSlug; action?: string }
  | { type: 'section'; section: string }
  | { type: 'route'; path: string };

type SearchIcon = ComponentType<{ className?: string }> | 'whatsapp';

type SettingsSearchItem = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  group: 'Communication' | 'Customers & work' | 'Technicians' | 'Payments & documents' | 'App & data';
  icon: SearchIcon;
  destination: SearchDestination;
  adminOnly?: boolean;
};

const SEARCH_ITEMS: SettingsSearchItem[] = [
  { id: 'calling', label: 'Calling', description: 'Customer calls and communication', keywords: 'phone calls dialer missed call', group: 'Communication', icon: PhoneCall, destination: { type: 'panel', panel: 'calling' } },
  { id: 'whatsapp-inbox', label: 'WhatsApp inbox', description: 'Read and send customer messages', keywords: 'chat messages meta cloud api', group: 'Communication', icon: 'whatsapp', destination: { type: 'panel', panel: 'whatsapp-inbox' }, adminOnly: true },
  { id: 'whatsapp-settings', label: 'WhatsApp settings', description: 'Send controls, templates, rates and expected bill', keywords: 'meta cloud api budget technician push mirror job assign', group: 'Communication', icon: 'whatsapp', destination: { type: 'panel', panel: 'whatsapp-settings' }, adminOnly: true },
  { id: 'email-tracking', label: 'Email tracking', description: 'Email open tracking preferences', keywords: 'mail opens pixel', group: 'Communication', icon: Mail, destination: { type: 'section', section: 'email-tracking' }, adminOnly: true },
  { id: 'reminders', label: 'Reminders', description: 'Search, filter and edit reminders', keywords: 'todo follow up alert customer general', group: 'Customers & work', icon: Bell, destination: { type: 'panel', panel: 'reminders' } },
  { id: 'add-general-reminder', label: 'Add general reminder', description: 'Create a reminder not tied to a customer', keywords: 'new alert todo', group: 'Customers & work', icon: BellPlus, destination: { type: 'panel', panel: 'add-general-reminder' } },
  { id: 'add-customer-reminder', label: 'Add customer reminder', description: 'Create a reminder for a customer', keywords: 'new alert follow up', group: 'Customers & work', icon: UserPlus, destination: { type: 'panel', panel: 'add-customer-reminder' } },
  { id: 'recurring-service', label: 'Recurring Service Tracker', description: 'Six-month and yearly service worklist', keywords: 'repeat annual periodic customer call', group: 'Customers & work', icon: Repeat, destination: { type: 'panel', panel: 'recurring-service' } },
  { id: 'advanced-customer-search', label: 'Advanced customer search', description: 'Find customers using combined filters', keywords: 'brand location service amc date filter', group: 'Customers & work', icon: Users, destination: { type: 'panel', panel: 'advanced-search' } },
  { id: 'customer-reviews', label: 'Customer reviews', description: 'Ratings and technician reviews', keywords: 'feedback stars job review', group: 'Customers & work', icon: Star, destination: { type: 'panel', panel: 'job-reviews' } },
  { id: 'warranty', label: 'Warranty management', description: 'Add product and part warranties', keywords: 'guarantee customer product part', group: 'Customers & work', icon: ShieldCheck, destination: { type: 'panel', panel: 'warranty' } },
  { id: 'merge-customers', label: 'Merge duplicate customers', description: 'Combine duplicate customer records', keywords: 'same person phone deduplicate', group: 'Customers & work', icon: GitMerge, destination: { type: 'panel', panel: 'merge-customers' }, adminOnly: true },
  { id: 'booking-archive', label: 'Done booking archive', description: 'Completed website booking records', keywords: 'website intent completed deleted', group: 'Customers & work', icon: ClipboardCheck, destination: { type: 'section', section: 'booking-intent-archive' }, adminOnly: true },
  { id: 'technician-locations', label: 'Technician locations', description: 'Last known technician locations', keywords: 'staff gps map current location', group: 'Technicians', icon: MapPin, destination: { type: 'section', section: 'technician-locations' } },
  { id: 'technician-management', label: 'Technician management', description: 'Add, edit or deactivate technicians', keywords: 'staff employee account salary password', group: 'Technicians', icon: Users, destination: { type: 'section', section: 'technician-management' } },
  { id: 'location-tracking', label: 'Location tracking', description: 'Enable automatic technician GPS updates', keywords: 'gps current map distance switch', group: 'Technicians', icon: Navigation, destination: { type: 'section', section: 'location-tracking' }, adminOnly: true },
  { id: 'device-tracker', label: 'Device tracker', description: 'Technician app devices and activity', keywords: 'phone handset fcm token', group: 'Technicians', icon: Smartphone, destination: { type: 'section', section: 'device-tracker' }, adminOnly: true },
  { id: 'pending-payments', label: 'Pending payments', description: 'Customer due amounts and payment dates', keywords: 'money outstanding due collect', group: 'Payments & documents', icon: IndianRupee, destination: { type: 'panel', panel: 'pending-payments' } },
  { id: 'add-pending-payment', label: 'Add pending payment', description: 'Record a new customer due amount', keywords: 'money outstanding due new', group: 'Payments & documents', icon: IndianRupee, destination: { type: 'panel', panel: 'pending-payments', action: 'add' } },
  { id: 'gst-invoices', label: 'GST invoices', description: 'View and manage tax invoices', keywords: 'tax bill invoice', group: 'Payments & documents', icon: Receipt, destination: { type: 'route', path: '/admin?view=gst-invoices' }, adminOnly: true },
  { id: 'amcs', label: 'View AMCs', description: 'Annual Maintenance Contracts', keywords: 'contract annual maintenance', group: 'Payments & documents', icon: FileText, destination: { type: 'route', path: '/admin?view=amc-view' } },
  { id: 'pdf-authenticity', label: 'Verify PDF authenticity', description: 'Check document fingerprints and codes', keywords: 'hash genuine amc bill invoice warranty quotation', group: 'Payments & documents', icon: FileCheck, destination: { type: 'panel', panel: 'pdf-authenticity' }, adminOnly: true },
  { id: 'service-report', label: 'Service report', description: 'Create a letterhead service report', keywords: 'pdf document letter head', group: 'Payments & documents', icon: FileText, destination: { type: 'route', path: '/admin?view=letterhead-documents&type=service_report' } },
  { id: 'amc-report', label: 'AMC report', description: 'Create a letterhead AMC report', keywords: 'pdf document contract letter head', group: 'Payments & documents', icon: FileText, destination: { type: 'route', path: '/admin?view=letterhead-documents&type=amc_report' } },
  { id: 'custom-document', label: 'Custom letterhead document', description: 'Create a custom customer document', keywords: 'pdf letter head', group: 'Payments & documents', icon: FileSignature, destination: { type: 'route', path: '/admin?view=letterhead-documents&type=custom_document' } },
  { id: 'direct-sale', label: 'Direct / office sale', description: 'Record a counter sale', keywords: 'cash office counter part no customer', group: 'Payments & documents', icon: Store, destination: { type: 'panel', panel: 'direct-sale' }, adminOnly: true },
  { id: 'payment-qr', label: 'Payment QR codes', description: 'Manage technician payment QR codes', keywords: 'upi scan dynamic amount', group: 'Payments & documents', icon: QrCode, destination: { type: 'section', section: 'payment-qr-codes' }, adminOnly: true },
  { id: 'upi-accounts', label: 'UPI payment accounts', description: 'UPI IDs used in WhatsApp payment links', keywords: 'pay phone pending payment', group: 'Payments & documents', icon: Wallet, destination: { type: 'section', section: 'upi-payment-accounts' }, adminOnly: true },
  { id: 'qr-image-generator', label: 'QR image generator', description: 'Create a styled downloadable QR image', keywords: 'scan link text rounded dots download', group: 'Payments & documents', icon: QrCode, destination: { type: 'section', section: 'qr-image-generator' }, adminOnly: true },
  { id: 'common-qr', label: 'Common technician QR codes', description: 'Non-payment QR codes shown in the technician app', keywords: 'scan staff assign technician', group: 'Payments & documents', icon: QrCode, destination: { type: 'section', section: 'common-qr-codes' }, adminOnly: true },
  { id: 'product-qr', label: 'Product verification QR codes', description: 'Manage genuine-product QR codes', keywords: 'scan authenticity genuine', group: 'Payments & documents', icon: Package, destination: { type: 'section', section: 'product-qr-codes' }, adminOnly: true },
  { id: 'todo-tasks', label: 'Todo tasks', description: 'Add and complete admin tasks', keywords: 'checklist work task', group: 'App & data', icon: ListTodo, destination: { type: 'section', section: 'todo-tasks' } },
  { id: 'amount-trackers', label: 'Amount trackers', description: 'Named running money totals', keywords: 'cash flow add subtract total', group: 'App & data', icon: IndianRupee, destination: { type: 'section', section: 'amount-trackers' }, adminOnly: true },
  { id: 'dashboard-glow', label: 'Follow-up glow highlights', description: 'Highlight today and tomorrow follow-ups', keywords: 'dashboard red yellow visual switch', group: 'App & data', icon: Sparkles, destination: { type: 'section', section: 'dashboard' } },
  { id: 'hide-amc-followups', label: 'Hide AMC follow-ups', description: 'Show only non-AMC jobs in Followup', keywords: 'dashboard amc filter service list switch', group: 'App & data', icon: Sparkles, destination: { type: 'section', section: 'dashboard' } },
  { id: 'count-non-amc-followups', label: 'Count only non-AMC follow-ups', description: 'Exclude AMC jobs from the Followup count', keywords: 'dashboard amc count stats total switch', group: 'App & data', icon: Sparkles, destination: { type: 'section', section: 'dashboard' } },
  { id: 'job-whatsapp', label: 'Job assign / unassign WhatsApp', description: 'Control the assignment WhatsApp popup', keywords: 'dashboard technician message notification switch', group: 'App & data', icon: 'whatsapp', destination: { type: 'section', section: 'dashboard' }, adminOnly: true },
  { id: 'app-lock', label: 'Admin app lock', description: 'App PIN and lock preferences', keywords: 'security pin biometric password', group: 'App & data', icon: Lock, destination: { type: 'section', section: 'app-lock' }, adminOnly: true },
  { id: 'lead-catalog', label: 'Lead sources & costs', description: 'Lead sources, sub-services and OTP rules', keywords: 'catalog booking source price cost', group: 'App & data', icon: Tags, destination: { type: 'panel', panel: 'lead-catalog' }, adminOnly: true },
  { id: 'privacy', label: 'Privacy Center', description: 'Data requests, consent and security audit', keywords: 'dsar delete access customer data gdpr', group: 'App & data', icon: ShieldCheck, destination: { type: 'panel', panel: 'privacy-center' }, adminOnly: true },
  { id: 'data-export', label: 'Data export', description: 'Download all database tables as CSV', keywords: 'backup zip download csv', group: 'App & data', icon: Download, destination: { type: 'section', section: 'data-export' }, adminOnly: true },
  { id: 'storage', label: 'Storage usage', description: 'Postgres, R2 and Cloudinary usage', keywords: 'database space files media', group: 'App & data', icon: Database, destination: { type: 'panel', panel: 'db-storage' }, adminOnly: true },
  { id: 'app-crashes', label: 'App crash reports', description: 'Technician and admin app errors', keywords: 'error logs stack android', group: 'App & data', icon: Bug, destination: { type: 'section', section: 'app-crashes' }, adminOnly: true },
];

const GROUPS: SettingsSearchItem['group'][] = [
  'Communication',
  'Customers & work',
  'Technicians',
  'Payments & documents',
  'App & data',
];

function ResultIcon({ icon }: { icon: SearchIcon }) {
  if (icon === 'whatsapp') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10">
        <WhatsAppLogo size={16} className="!h-4 !w-4" />
      </span>
    );
  }
  const Icon = icon;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
      <Icon className="!h-4 !w-4" />
    </span>
  );
}

type SettingsSearchProps = {
  isManager: boolean;
  openPanel: (panel: SettingsPanelSlug, options?: { action?: string }) => void;
};

export function SettingsSearch({ isManager, openPanel }: SettingsSearchProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => SEARCH_ITEMS.filter((item) => !isManager || !item.adminOnly),
    [isManager]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectItem = (item: SettingsSearchItem) => {
    setOpen(false);
    const target = item.destination;
    if (target.type === 'panel') {
      openPanel(target.panel, { action: target.action });
      return;
    }
    if (target.type === 'route') {
      navigate(target.path);
      return;
    }
    requestAnimationFrame(() => scrollToSettingsSection(target.section));
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10 w-full justify-start gap-2 border-border/80 bg-background/80 px-3 text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground sm:w-72"
        aria-label="Search settings"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search settings…</span>
        <span className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
          <span className="text-xs">⌘</span>K
        </span>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search settings"
        description="Type to find any settings panel, tool or section, then press Enter to open it."
      >
        <div className="border-b bg-gradient-to-r from-blue-50/80 to-cyan-50/60 px-4 py-3 dark:from-blue-950/30 dark:to-cyan-950/20">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Find a setting
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search tools, controls, documents, payments, or communication.
          </p>
        </div>
        <CommandInput placeholder="Try “WhatsApp”, “technician”, “PDF”…" aria-label="Search all settings" />
        <CommandList className="max-h-[min(60vh,480px)] p-1">
          <CommandEmpty>
            <div className="px-4 py-3">
              <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
              <p className="font-medium">No matching setting</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a shorter name or a related word.</p>
            </div>
          </CommandEmpty>
          {GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <CommandGroup key={group} heading={group}>
                {groupItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.description} ${item.keywords}`}
                    onSelect={() => selectItem(item)}
                    className="cursor-pointer gap-3 rounded-lg px-3 py-2.5"
                  >
                    <ResultIcon icon={item.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <CommandShortcut>
                      <ArrowRight className="!h-4 !w-4 opacity-60" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span>{items.length} searchable settings</span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Opens the exact place
          </span>
        </div>
      </CommandDialog>
    </>
  );
}
