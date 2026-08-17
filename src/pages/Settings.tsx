import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Settings as SettingsIcon, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  User,
  Phone,
  QrCode,
  Package,
  MapPin,
  Download,
  Receipt,
  FileText,
  LogOut,
  ListTodo,
  PhoneCall,
  RefreshCw,
  DollarSign,
  Bell,
  GitMerge,
  Repeat,
  ShieldCheck,
  CalendarPlus,
  Database,
  Star,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  isManagerBlockedSettingsPanel,
  MANAGER_RESTRICTED_TITLE,
} from '@/lib/managerAccess';
import { ensureAdminSupabaseSession } from '@/lib/auth';
import { deleteTechnicianCompletely } from '@/lib/deleteTechnician';
import { buildTechnicianSalaryPayload, getCurrentMonthKey } from '@/lib/technicianSalaryForPeriod';
import { Technician } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { TechnicianIdCardLinks } from '@/components/admin/TechnicianIdCardLinks';
import { CommonQrCode, invalidateQrCodesCache, cacheQrCodes, getCachedQrCodes, normalizeTechnicianAssignedCommonQrIds, mapCommonQrRow } from '@/lib/qrCodeManager';
import { isValidUpiId, normalizeUpiId, normalizePaymentPhone } from '@/lib/upiPaymentAccounts';
// NOTE: `jszip` and `qr-code-styling` are heavy and only used by specific
// button actions (data export ZIP, styled QR image). They are dynamically
// imported at their call sites so they stay out of the main Settings chunk.
import CallingPage from '@/pages/CallingPage';
import WhatsAppInboxPage from '@/pages/WhatsAppInboxPage';
import WhatsAppSettingsPage from '@/pages/WhatsAppSettingsPage';
import PrivacyCenterPage from '@/pages/PrivacyCenterPage';
import LeadCatalogSettingsPage from '@/pages/LeadCatalogSettingsPage';
import { WhatsAppLogo } from '@/components/whatsapp/WhatsAppLogo';
import { tryNativeBackHandlers } from '@/lib/nativeBackButton';
import { registerAdminPWA } from '@/lib/pwa';
import { EmailTrackingSettings } from '@/components/admin/EmailTrackingSettings';
import { BookingIntentArchiveSettings } from '@/components/admin/BookingIntentArchiveSettings';
import { DeviceTrackerSettings } from '@/components/admin/DeviceTrackerSettings';
import {
  defaultTechPushPrefs,
  normalizeTechPushPrefs,
  TECH_PUSH_CATEGORIES,
  TECH_PUSH_LABELS,
  type TechPushPrefs,
} from '@/lib/pushNotificationPrefs';
import {
  defaultTechWhatsAppPrefs,
  normalizeTechWhatsAppPrefs,
  TECH_WHATSAPP_CATEGORIES,
  TECH_WHATSAPP_LABELS,
  type TechWhatsAppPrefs,
} from '@/lib/techWhatsAppPrefs';
import { AdminAppLockSettings } from '@/components/admin/AdminAppLockSettings';
import { AppCrashReports } from '@/components/admin/AppCrashReports';
import {
  isFollowUpGlowEnabled,
  setFollowUpGlowEnabled,
} from '@/lib/followUpGlowSettings';
import {
  readFollowUpDisplaySettings,
  saveFollowUpDisplaySettings,
} from '@/lib/followUpDisplaySettings';
import {
  JOB_WA_NOTIFY_CHANGED_EVENT,
  fetchJobWhatsAppNotifyPrefs,
  readJobWhatsAppNotifyPrefsCached,
  saveJobWhatsAppMasterEnabled,
  type JobWhatsAppNotifyPrefs,
} from '@/lib/jobAssignWhatsAppSettingsCache';
import {
  fetchPdfCompressionEnabled,
  savePdfCompressionEnabled,
} from '@/lib/pdfCompressionSettings';
import { SettingsRemindersDialog } from '@/components/reminders/SettingsRemindersDialog';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
import { RecurringServiceTracker } from '@/components/reminders/RecurringServiceTracker';
import { SettingsPendingPaymentsDialogV2 } from '@/components/reminders/PendingPaymentsDialogV2';
import UpiPaymentAccountsManager from '@/components/UpiPaymentAccountsManager';
import AdvancedCustomerSearchDialog from '@/components/admin/AdvancedCustomerSearchDialog';
import { SettingsActionCard } from '@/components/admin/SettingsActionCard';
import { SettingsSearch } from '@/components/admin/SettingsSearch';
import PdfAuthenticityVerifyPage from '@/pages/PdfAuthenticityVerifyPage';
import JobReviewsPage from '@/pages/JobReviewsPage';
import DbStorageStatsPage from '@/pages/DbStorageStatsPage';
import AiUsagePage from '@/pages/AiUsagePage';
import MergeCustomersDialog from '@/components/admin/MergeCustomersDialog';
import WarrantyManagementDialog from '@/components/admin/WarrantyManagementDialog';
import DirectSaleDialog from '@/components/admin/DirectSaleDialog';
import { scrollToSettingsSection } from '@/lib/settingsSectionScroll';
import { SETTINGS_SECTIONS } from '@/lib/settingsSections';
import {
  buildSettingsSearch,
  parseSettingsUrl,
  settingsLocation,
  settingsPanelPath,
  type SettingsPanelSlug,
} from '@/lib/settingsUrl';

function readSettingsScrollY(): number {
  return window.scrollY ?? document.documentElement.scrollTop ?? 0;
}

/** Restore list scroll after closing a settings panel (layout may settle over a few frames). */
function scheduleSettingsScrollRestore(y: number) {
  const restore = () => window.scrollTo({ top: y, behavior: 'auto' });
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 50);
  window.setTimeout(restore, 200);
}

function exportTableLabel(name: string): string {
  if (name === 'app_secrets') return 'App Secrets (values redacted)';
  return name
    .replace(/_/g, ' ')
    .replace(/\bwhatsapp\b/gi, 'WhatsApp')
    .replace(/\bamc\b/gi, 'AMC')
    .replace(/\bpdf\b/gi, 'PDF')
    .replace(/\bqr\b/gi, 'QR')
    .replace(/\bupi\b/gi, 'UPI')
    .replace(/\bcrm\b/gi, 'CRM')
    .replace(/\botp\b/gi, 'OTP')
    .replace(/\brls\b/gi, 'RLS')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type ExportTableSpec = { name: string; orderBy: string; label: string };

const Settings = () => {
  const { user, isAdmin, logout, authInitializing } = useAuth();
  const { isManager } = useAdminRole();
  const managerRestrictedTitle = MANAGER_RESTRICTED_TITLE;
  const navigate = useNavigate();
  const location = useLocation();

  const panelReturnScrollYRef = useRef<number | null>(null);
  const prevSettingsPanelRef = useRef<SettingsPanelSlug | null>(null);
  const skipSectionScrollRef = useRef(false);

  const closeSettingsPanel = useCallback(() => {
    navigate(
      settingsLocation(
        buildSettingsSearch({ clearPanel: true, section: null }, location.search)
      ),
      { replace: true }
    );
  }, [navigate, location.search]);

  const openSettingsPanel = useCallback(
    (
      panel: SettingsPanelSlug,
      options?: { id?: string; action?: string }
    ) => {
      if (isManager && isManagerBlockedSettingsPanel(panel)) {
        toast.error(managerRestrictedTitle);
        return;
      }
      panelReturnScrollYRef.current = readSettingsScrollY();
      navigate(
        settingsLocation(
          buildSettingsSearch(
            {
              panel,
              panelId: options?.id ?? null,
              panelAction: options?.action ?? null,
              section: null,
            },
            location.search
          )
        )
      );
    },
    [navigate, location.search, isManager, managerRestrictedTitle]
  );

  const onSettingsPanelOpenChange = useCallback(
    (panel: SettingsPanelSlug, open: boolean) => {
      if (!open && parseSettingsUrl(location.search).panel === panel) {
        closeSettingsPanel();
      }
    },
    [closeSettingsPanel, location.search]
  );

  const bindSettingsPanelDismiss = useCallback(
    (panel: SettingsPanelSlug, reset?: () => void) =>
      (open: boolean) => {
        if (!open) {
          reset?.();
          onSettingsPanelOpenChange(panel, false);
        }
      },
    [onSettingsPanelOpenChange]
  );

  useEffect(() => {
    registerAdminPWA();
  }, []);

  // Admin Settings lives at /settings; after logout there is no user but this route still mounted — send to /admin so AdminLogin shows.
  useEffect(() => {
    if (authInitializing) return;
    if (!user) {
      navigate('/admin', { replace: true });
    }
  }, [user, authInitializing, navigate]);

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [technicianToDelete, setTechnicianToDelete] = useState<Technician | null>(null);
  const [deleteTechnicianStep, setDeleteTechnicianStep] = useState<0 | 1 | 2>(0);
  const [isDeletingTechnician, setIsDeletingTechnician] = useState(false);
  
  // Common QR Code management states (payment QR codes)
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addQrCodeDialogOpen, setAddQrCodeDialogOpen] = useState(false);
  const [editQrCodeDialogOpen, setEditQrCodeDialogOpen] = useState(false);
  const [selectedQrCode, setSelectedQrCode] = useState<CommonQrCode | null>(null);
  const [qrCodeFormData, setQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: '',
    upiId: '',
    payeeName: '',
    phone: '',
    dynamicUpiEnabled: false,
  });
  const [qrImageGeneratorData, setQrImageGeneratorData] = useState({
    content: '',
    fileName: 'hydrogen-ro-qr'
  });
  const [isGeneratingQrImage, setIsGeneratingQrImage] = useState(false);

  // Common QR (non-payment) management states - shown below payment QR on technician app
  const [technicianCommonQrCodes, setTechnicianCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addTechnicianCommonQrDialogOpen, setAddTechnicianCommonQrDialogOpen] = useState(false);
  const [editTechnicianCommonQrDialogOpen, setEditTechnicianCommonQrDialogOpen] = useState(false);
  const [selectedTechnicianCommonQr, setSelectedTechnicianCommonQr] = useState<CommonQrCode | null>(null);
  const [technicianCommonQrFormData, setTechnicianCommonQrFormData] = useState({ name: '', qrCodeUrl: '' });
  const [technicianCommonQrUploading, setTechnicianCommonQrUploading] = useState(false);
  const [qrCodeUploading, setQrCodeUploading] = useState(false);

  // Product QR Code management states
  const [productQrCodes, setProductQrCodes] = useState<any[]>([]);
  const [addProductQrCodeDialogOpen, setAddProductQrCodeDialogOpen] = useState(false);
  const [editProductQrCodeDialogOpen, setEditProductQrCodeDialogOpen] = useState(false);
  const [selectedProductQrCode, setSelectedProductQrCode] = useState<any | null>(null);
  const [productQrCodeFormData, setProductQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: '',
    productImageUrl: '',
    productName: '',
    productDescription: '',
    productMrp: ''
  });
  const [technicianFormData, setTechnicianFormData] = useState({
    fullName: '',
    phone: '',
    whatsappPhone: '',
    email: '',
    employeeId: '',
    password: '',
    qrCode: '', // QR code image URL
    photo: '', // Technician photo URL
    upiId: '',
    payeeName: '',
    upiPhone: '',
    dynamicUpiEnabled: false,
    baseSalary: 0,
    salaryEffectiveFromMonth: getCurrentMonthKey(),
    accountStatus: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    pushNotificationsEnabled: true,
    pushPrefs: defaultTechPushPrefs() as TechPushPrefs,
    whatsappPrefs: defaultTechWhatsAppPrefs() as TechWhatsAppPrefs,
    salarySlipAutoSend: false,
    visibleQrCodes: [] as string[], // Array of QR code IDs visible to this technician
    commonQrCodeIds: [] as string[] // Common QRs to show to this technician (below payment QR), multiple allowed
  });
  const [newlyCreatedTechnicianId, setNewlyCreatedTechnicianId] = useState<string | null>(null);

  // Location tracking setting
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('technician_location_tracking_enabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  });

  const [followUpGlowEnabled, setFollowUpGlowEnabledState] = useState<boolean>(isFollowUpGlowEnabled);
  const [followUpDisplaySettings, setFollowUpDisplaySettingsState] = useState(
    readFollowUpDisplaySettings
  );
  const [jobWaNotifyPrefs, setJobWaNotifyPrefs] = useState<JobWhatsAppNotifyPrefs>(
    () =>
      readJobWhatsAppNotifyPrefsCached() || {
        enabled: true,
        autoAssign: false,
        autoUnassign: false,
      }
  );
  const [jobWaNotifySaving, setJobWaNotifySaving] = useState(false);
  const [pdfCompressionEnabled, setPdfCompressionEnabled] = useState(true);
  const [pdfCompressionSaving, setPdfCompressionSaving] = useState(false);

  // Download data state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [exportTableCatalog, setExportTableCatalog] = useState<ExportTableSpec[]>([]);

  const [mergeCustomersOpen, setMergeCustomersOpen] = useState(false);
  const [warrantyDialogOpen, setWarrantyDialogOpen] = useState(false);
  const [directSaleOpen, setDirectSaleOpen] = useState(false);

  // Todo management states
  const [todos, setTodos] = useState<Array<{ id: string; text: string; created_at: string }>>([]);
  const [addTodoDialogOpen, setAddTodoDialogOpen] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [todoToDelete, setTodoToDelete] = useState<string | null>(null);

  // Amount tracker states (e.g. "Cash flow" running totals)
  const [amountTrackers, setAmountTrackers] = useState<
    Array<{ id: string; name: string; amount: number; created_at: string; updated_at: string }>
  >([]);
  const [addTrackerDialogOpen, setAddTrackerDialogOpen] = useState(false);
  const [newTrackerName, setNewTrackerName] = useState('');
  const [newTrackerAmount, setNewTrackerAmount] = useState('');
  const [trackerToDelete, setTrackerToDelete] = useState<string | null>(null);
  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>({});
  const [adjustingTrackerId, setAdjustingTrackerId] = useState<string | null>(null);

  // Calling view state
  const [showCallingPage, setShowCallingPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'calling'
  );
  const [showWhatsAppInboxPage, setShowWhatsAppInboxPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'whatsapp-inbox'
  );
  const [showWhatsAppSettingsPage, setShowWhatsAppSettingsPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'whatsapp-settings'
  );
  const [showPrivacyCenterPage, setShowPrivacyCenterPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'privacy-center'
  );
  const [showPdfAuthenticityPage, setShowPdfAuthenticityPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'pdf-authenticity'
  );
  const [showJobReviewsPage, setShowJobReviewsPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'job-reviews'
  );
  const [showDbStoragePage, setShowDbStoragePage] = useState(
    () => parseSettingsUrl(location.search).panel === 'db-storage'
  );
  const [showAiUsagePage, setShowAiUsagePage] = useState(
    () => parseSettingsUrl(location.search).panel === 'ai-usage'
  );
  const [showRecurringServicePage, setShowRecurringServicePage] = useState(
    () => parseSettingsUrl(location.search).panel === 'recurring-service'
  );
  const [showLeadCatalogPage, setShowLeadCatalogPage] = useState(
    () => parseSettingsUrl(location.search).panel === 'lead-catalog'
  );

  const [remindersDialogOpen, setRemindersDialogOpen] = useState(false);
  const [advancedSearchDialogOpen, setAdvancedSearchDialogOpen] = useState(false);
  const [addGeneralReminderOpen, setAddGeneralReminderOpen] = useState(false);
  const [addCustomerReminderOpen, setAddCustomerReminderOpen] = useState(false);

  // Pending payments dialog (lazy load, add/edit/complete)
  const [pendingPaymentsDialogOpen, setPendingPaymentsDialogOpen] = useState(false);
  const [pendingPaymentsInitialAction, setPendingPaymentsInitialAction] = useState<
    'list' | 'add' | 'whatsapp'
  >('list');
  const [pendingPaymentsInitialReminderId, setPendingPaymentsInitialReminderId] = useState<
    string | null
  >(null);
  const [remindersInitialReminderId, setRemindersInitialReminderId] = useState<string | null>(null);

  // Below-the-fold Settings sections — load once when near viewport (or when a panel needs them).
  type SettingsLazySection = 'todos' | 'trackers' | 'commonQr' | 'techQr' | 'productQr';
  const settingsLazyStartedRef = useRef<Record<SettingsLazySection, boolean>>({
    todos: false,
    trackers: false,
    commonQr: false,
    techQr: false,
    productQr: false,
  });
  const todosSectionRef = useRef<HTMLDivElement | null>(null);
  const trackersSectionRef = useRef<HTMLDivElement | null>(null);
  const commonQrSectionRef = useRef<HTMLDivElement | null>(null);
  const techQrSectionRef = useRef<HTMLDivElement | null>(null);
  const productQrSectionRef = useRef<HTMLDivElement | null>(null);
  const ensureSettingsSectionLoadedRef = useRef<(key: SettingsLazySection) => void>(() => {});

  // Reminder / pending-payment push tap while already on Settings.
  // Non-settings payloads (tech_call, job focus, payments) are queued and
  // forwarded to /admin so they are not swallowed by this handler.
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/adminPushDeepLink').then(
      ({ setAdminPushDeepLinkHandler, queueAdminPushDeepLink }) => {
        if (cancelled) return;
        setAdminPushDeepLinkHandler((payload) => {
          if (payload.kind === 'settings' && payload.panel === 'whatsapp-inbox') {
            const phone = payload.phone || payload.reminderId;
            if (!phone) return;
            navigate(settingsPanelPath('whatsapp-inbox', { id: phone }));
            return;
          }

          if (payload.kind === 'settings' && payload.panel === 'job-reviews') {
            navigate(settingsPanelPath('job-reviews'));
            return;
          }

          if (payload.kind === 'settings' && payload.panel && payload.reminderId) {
            navigate(
              settingsPanelPath(payload.panel, {
                id: payload.reminderId,
                action: payload.action,
              })
            );
            return;
          }
          queueAdminPushDeepLink(payload);
          navigate('/admin');
        });
      }
    );
    return () => {
      cancelled = true;
      // Do not clear handler — AdminPortal keeps a WhatsApp fallback during remounts.
    };
  }, [navigate]);

  // Managers cannot open sensitive settings panels (deep links / bookmarks).
  useEffect(() => {
    if (!isManager) return;
    const panel = parseSettingsUrl(location.search).panel;
    if (!isManagerBlockedSettingsPanel(panel)) return;
    toast.error(managerRestrictedTitle);
    navigate(
      settingsLocation(buildSettingsSearch({ clearPanel: true, section: null }, '')),
      { replace: true }
    );
  }, [isManager, location.search, navigate, managerRestrictedTitle]);

  // Sync settings panels (?panel=) for mobile swipe-back.
  useEffect(() => {
    const parsed = parseSettingsUrl(location.search);
    const panel = parsed.panel;
    const prevPanel = prevSettingsPanelRef.current;

    if (prevPanel && !panel) {
      skipSectionScrollRef.current = true;
      const y = panelReturnScrollYRef.current;
      if (y != null) {
        panelReturnScrollYRef.current = null;
        scheduleSettingsScrollRestore(y);
      }
    }

    prevSettingsPanelRef.current = panel;

    setShowCallingPage(panel === 'calling');
    setShowWhatsAppInboxPage(panel === 'whatsapp-inbox');
    setShowWhatsAppSettingsPage(panel === 'whatsapp-settings' && !isManager);
    setShowPrivacyCenterPage(panel === 'privacy-center' && !isManager);
    setShowPdfAuthenticityPage(panel === 'pdf-authenticity' && !isManager);
    setShowJobReviewsPage(panel === 'job-reviews');
    setShowDbStoragePage(panel === 'db-storage' && !isManager);
    setShowAiUsagePage(panel === 'ai-usage' && !isManager);
    setShowRecurringServicePage(panel === 'recurring-service');
    setShowLeadCatalogPage(panel === 'lead-catalog' && !isManager);
    setRemindersDialogOpen(panel === 'reminders');
    setAdvancedSearchDialogOpen(panel === 'advanced-search');
    setAddGeneralReminderOpen(panel === 'add-general-reminder');
    setAddCustomerReminderOpen(panel === 'add-customer-reminder');
    setMergeCustomersOpen(panel === 'merge-customers' && !isManager);
    setWarrantyDialogOpen(panel === 'warranty');
    setDirectSaleOpen(panel === 'direct-sale' && !isManager);
    setAddTechnicianDialogOpen(panel === 'add-technician' && !isManager);
    setEditTechnicianDialogOpen(panel === 'edit-technician' && !!parsed.panelId && !isManager);
    setAddQrCodeDialogOpen(panel === 'add-payment-qr' && !isManager);
    setEditQrCodeDialogOpen(panel === 'edit-payment-qr' && !!parsed.panelId && !isManager);
    setAddTechnicianCommonQrDialogOpen(panel === 'add-tech-qr' && !isManager);
    setEditTechnicianCommonQrDialogOpen(panel === 'edit-tech-qr' && !!parsed.panelId && !isManager);
    setAddProductQrCodeDialogOpen(panel === 'add-product-qr' && !isManager);
    setEditProductQrCodeDialogOpen(panel === 'edit-product-qr' && !!parsed.panelId && !isManager);
    setAddTodoDialogOpen(panel === 'add-todo');
    setAddTrackerDialogOpen(panel === 'add-tracker' && !isManager);
    setPendingPaymentsDialogOpen(panel === 'pending-payments');
    if (panel === 'pending-payments') {
      setPendingPaymentsInitialReminderId(parsed.panelId);
      setPendingPaymentsInitialAction(
        parsed.panelAction === 'add'
          ? 'add'
          : parsed.panelAction === 'whatsapp'
            ? 'whatsapp'
            : 'list'
      );
    } else {
      setPendingPaymentsInitialReminderId(null);
    }
    if (panel === 'reminders') {
      setRemindersInitialReminderId(parsed.panelId);
    } else {
      setRemindersInitialReminderId(null);
    }

    if (panel === 'edit-technician' && parsed.panelId) {
      const tech = technicians.find((t) => t.id === parsed.panelId);
      if (tech && selectedTechnician?.id !== tech.id) {
        setSelectedTechnician(tech);
        setTechnicianFormData({
          fullName: tech.fullName,
          phone: tech.phone,
          whatsappPhone: tech.whatsappPhone || '',
          email: tech.email,
          employeeId: tech.employeeId,
          password: '',
          qrCode: (tech as any).qrCode || '',
          photo: (tech as any).photo || '',
          upiId: (tech as any).upiId || '',
          payeeName: (tech as any).payeeName || '',
          upiPhone: (tech as any).upiPhone || '',
          dynamicUpiEnabled: !!(tech as any).dynamicUpiEnabled,
          baseSalary: tech.salary?.baseSalary || 0,
          salaryEffectiveFromMonth: getCurrentMonthKey(),
          visibleQrCodes: tech.visibleQrCodes || [],
          commonQrCodeIds: (tech as any).commonQrCodeIds || [],
          accountStatus: (tech.account_status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') || 'ACTIVE',
          pushNotificationsEnabled: tech.push_notifications_enabled !== false,
          pushPrefs: normalizeTechPushPrefs((tech as any).push_prefs),
          whatsappPrefs: normalizeTechWhatsAppPrefs((tech as any).whatsapp_prefs),
          salarySlipAutoSend: (tech as any).salary_slip_auto_send === true,
        });
        setNewlyCreatedTechnicianId(null);
      }
    }

    if (panel === 'edit-payment-qr' && parsed.panelId) {
      const qr = commonQrCodes.find((q) => q.id === parsed.panelId);
      if (qr && selectedQrCode?.id !== qr.id) {
        setSelectedQrCode(qr);
        setQrCodeFormData({
          name: qr.name,
          qrCodeUrl: qr.qrCodeUrl || '',
          upiId: qr.upiId || '',
          payeeName: qr.payeeName || '',
          phone: qr.phone || '',
          dynamicUpiEnabled: !!qr.dynamicUpiEnabled,
        });
      }
    }

    if (panel === 'edit-tech-qr' && parsed.panelId) {
      const qr = technicianCommonQrCodes.find((q) => q.id === parsed.panelId);
      if (qr && selectedTechnicianCommonQr?.id !== qr.id) {
        setSelectedTechnicianCommonQr(qr);
        setTechnicianCommonQrFormData({ name: qr.name, qrCodeUrl: '' });
      }
    }

    if (panel === 'edit-product-qr' && parsed.panelId) {
      const qr = productQrCodes.find((q) => q.id === parsed.panelId);
      if (qr && selectedProductQrCode?.id !== qr.id) {
        setSelectedProductQrCode(qr);
        setProductQrCodeFormData({
          name: qr.name || '',
          qrCodeUrl: '',
          productImageUrl: '',
          productName: '',
          productDescription: '',
          productMrp: '',
        });
      }
    }
  }, [
    location.search,
    technicians,
    commonQrCodes,
    technicianCommonQrCodes,
    productQrCodes,
    selectedTechnician?.id,
    selectedQrCode?.id,
    selectedTechnicianCommonQr?.id,
    selectedProductQrCode?.id,
  ]);

  useEffect(() => {
    const parsed = parseSettingsUrl(location.search);
    if (parsed.panel) return;

    if (skipSectionScrollRef.current) {
      skipSectionScrollRef.current = false;
      return;
    }

    const section = parsed.section;
    if (!section) return;

    if (!(section in SETTINGS_SECTIONS)) return;

    return scrollToSettingsSection(section, {
      onComplete: () => {
        navigate('/settings', { replace: true });
      },
    });
  }, [location.search, navigate]);

  // Thin hydrate of job WhatsApp prefs (4 bools) once; assign path uses localStorage after.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { prefs } = await fetchJobWhatsAppNotifyPrefs();
      if (!cancelled) setJobWaNotifyPrefs(prefs);
    })();
    const onChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<JobWhatsAppNotifyPrefs>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setJobWaNotifyPrefs({
          enabled: detail.enabled !== false,
          autoAssign: detail.autoAssign === true,
          autoUnassign: detail.autoUnassign === true,
        });
      } else {
        const cached = readJobWhatsAppNotifyPrefsCached();
        if (cached) setJobWaNotifyPrefs(cached);
      }
    };
    window.addEventListener(JOB_WA_NOTIFY_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(JOB_WA_NOTIFY_CHANGED_EVENT, onChanged);
    };
  }, []);

  useEffect(() => {
    if (isManager) return;
    let cancelled = false;
    void fetchPdfCompressionEnabled().then(({ enabled }) => {
      if (!cancelled) setPdfCompressionEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  // Handle location tracking toggle
  const handleLocationTrackingToggle = (enabled: boolean) => {
    setLocationTrackingEnabled(enabled);
    localStorage.setItem('technician_location_tracking_enabled', enabled.toString());
    // Dispatch custom event so other tabs/pages can react immediately
    window.dispatchEvent(new CustomEvent('locationTrackingChanged', {
      detail: { enabled }
    }));
    toast.success(enabled ? '✅ Location tracking enabled - technicians\' locations will be automatically updated' : '🚫 Location tracking disabled - all location updates are now blocked');
  };

  const handleFollowUpGlowToggle = (enabled: boolean) => {
    setFollowUpGlowEnabledState(enabled);
    setFollowUpGlowEnabled(enabled);
    toast.success(
      enabled
        ? 'Follow-up glow enabled — today (red) and tomorrow (yellow) highlights are on'
        : 'Follow-up glow disabled — dashboard highlights turned off'
    );
  };

  const updateFollowUpDisplaySettings = (
    patch: Partial<typeof followUpDisplaySettings>,
    successMessage: string
  ) => {
    const next = { ...followUpDisplaySettings, ...patch };
    setFollowUpDisplaySettingsState(next);
    saveFollowUpDisplaySettings(next);
    toast.success(successMessage);
  };

  const handleJobWaMasterToggle = async (enabled: boolean) => {
    const prev = jobWaNotifyPrefs;
    setJobWaNotifyPrefs({ ...prev, enabled });
    setJobWaNotifySaving(true);
    try {
      const result = await saveJobWhatsAppMasterEnabled(enabled);
      if (!result.ok) {
        setJobWaNotifyPrefs(prev);
        toast.error(result.error || 'Could not save job WhatsApp setting');
        return;
      }
      if (result.prefs) setJobWaNotifyPrefs(result.prefs);
      toast.success(
        enabled
          ? 'Job WhatsApp on — assign/unassign can show message or auto-send'
          : 'Job WhatsApp off — no WhatsApp popup on assign/unassign'
      );
    } finally {
      setJobWaNotifySaving(false);
    }
  };

  const handlePdfCompressionToggle = async (enabled: boolean) => {
    const previous = pdfCompressionEnabled;
    setPdfCompressionEnabled(enabled);
    setPdfCompressionSaving(true);
    try {
      const result = await savePdfCompressionEnabled(enabled);
      if (!result.ok) {
        setPdfCompressionEnabled(previous);
        toast.error(result.error || 'Could not save PDF compression setting');
        return;
      }
      toast.success(
        enabled
          ? 'PDF compression enabled'
          : 'PDF compression disabled — original PDFs will be used'
      );
    } finally {
      setPdfCompressionSaving(false);
    }
  };

  // Transform technician data from database format to frontend format
  const transformTechnicianData = (tech: any) => ({
    id: tech.id,
    fullName: tech.full_name,
    phone: tech.phone,
    whatsappPhone: tech.whatsapp_phone || tech.whatsappPhone || '',
    email: tech.email,
    employeeId: tech.employee_id,
    account_status: tech.account_status || 'ACTIVE',
    push_notifications_enabled: tech.push_notifications_enabled !== false,
    push_prefs: tech.push_prefs && typeof tech.push_prefs === 'object' ? tech.push_prefs : {},
    whatsapp_prefs:
      tech.whatsapp_prefs && typeof tech.whatsapp_prefs === 'object' ? tech.whatsapp_prefs : {},
    salary_slip_auto_send: tech.salary_slip_auto_send === true,
    skills: tech.skills,
    serviceAreas: tech.service_areas,
    status: tech.status,
    currentLocation: tech.current_location,
    workSchedule: tech.work_schedule,
    performance: tech.performance,
    vehicle: tech.vehicle,
    salary: tech.salary,
    qrCode: tech.qr_code || tech.qrCode || '',
    photo: tech.photo || '',
    upiId: tech.upi_id || tech.upiId || '',
    payeeName: tech.payee_name || tech.payeeName || '',
    upiPhone: tech.upi_phone || tech.upiPhone || '',
    dynamicUpiEnabled: !!(tech.dynamic_upi_enabled ?? tech.dynamicUpiEnabled),
    visibleQrCodes: tech.visible_qr_codes || [],
    commonQrCodeIds: normalizeTechnicianAssignedCommonQrIds({
      common_qr_code_ids: tech.common_qr_code_ids,
      common_qr_code_id: (tech as any).common_qr_code_id,
    }),
    createdAt: tech.created_at,
    updatedAt: tech.updated_at
  });

  const loadTechnicians = async () => {
    try {
      // OPTIMIZATION: Limit technicians fetch
      const { data, error } = await db.technicians.getAll(100);
      if (error) throw error;
      
      if (data) {
        const transformedTechnicians = data.map(transformTechnicianData);
        setTechnicians(transformedTechnicians);
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
      toast.error('Failed to load technicians');
    }
  };

  const resetDeleteTechnicianFlow = () => {
    setTechnicianToDelete(null);
    setDeleteTechnicianStep(0);
    setIsDeletingTechnician(false);
  };

  const handleStartDeleteTechnician = (technician: Technician) => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setTechnicianToDelete(technician);
    setDeleteTechnicianStep(1);
    closeSettingsPanel();
    setSelectedTechnician(null);
  };

  const handleExecuteDeleteTechnician = async () => {
    if (!technicianToDelete) return;
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }

    setIsDeletingTechnician(true);
    try {
      const { authSyncSkipped } = await deleteTechnicianCompletely(technicianToDelete.id);

      toast.success(`Technician "${technicianToDelete.fullName}" and all related data were deleted`);
      if (authSyncSkipped) {
        toast.warning(
          'Technician removed from the app. Restart dev server (npm run dev) or deploy to also remove their login account.'
        );
      }
      resetDeleteTechnicianFlow();
      await loadTechnicians();
      invalidateQrCodesCache();
    } catch (error) {
      console.error('Delete technician error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete technician');
    } finally {
      setIsDeletingTechnician(false);
    }
  };

  // Generate employee ID
  const generateEmployeeId = (): string => {
    const prefix = 'TECH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  // Technician management functions
  const handleAddTechnician = () => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    ensureSettingsSectionLoadedRef.current('commonQr');
    ensureSettingsSectionLoadedRef.current('techQr');
    setTechnicianFormData({
      fullName: '',
      phone: '',
      whatsappPhone: '',
      email: '',
      employeeId: generateEmployeeId(),
      password: '',
      qrCode: '',
      photo: '',
      upiId: '',
      payeeName: '',
      upiPhone: '',
      dynamicUpiEnabled: false,
      baseSalary: 0,
      salaryEffectiveFromMonth: getCurrentMonthKey(),
      visibleQrCodes: [],
      commonQrCodeIds: [],
      accountStatus: 'ACTIVE',
      pushNotificationsEnabled: true,
      pushPrefs: defaultTechPushPrefs(),
      whatsappPrefs: defaultTechWhatsAppPrefs(),
      salarySlipAutoSend: false,
    });
    setNewlyCreatedTechnicianId(null);
    openSettingsPanel('add-technician');
  };

  const handleEditTechnician = (technician: Technician) => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    ensureSettingsSectionLoadedRef.current('commonQr');
    ensureSettingsSectionLoadedRef.current('techQr');
    setSelectedTechnician(technician);
    setTechnicianFormData({
      fullName: technician.fullName,
      phone: technician.phone,
      whatsappPhone: technician.whatsappPhone || '',
      email: technician.email,
      employeeId: technician.employeeId,
      password: '', // Don't show existing password for security
      qrCode: (technician as any).qrCode || '',
      photo: (technician as any).photo || '',
      upiId: (technician as any).upiId || '',
      payeeName: (technician as any).payeeName || '',
      upiPhone: (technician as any).upiPhone || '',
      dynamicUpiEnabled: !!(technician as any).dynamicUpiEnabled,
      baseSalary: technician.salary?.baseSalary || 0,
      salaryEffectiveFromMonth: getCurrentMonthKey(),
      visibleQrCodes: technician.visibleQrCodes || [],
      commonQrCodeIds: (technician as any).commonQrCodeIds || [],
      accountStatus: (technician.account_status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') || 'ACTIVE',
      pushNotificationsEnabled: technician.push_notifications_enabled !== false,
      pushPrefs: normalizeTechPushPrefs((technician as any).push_prefs),
      whatsappPrefs: normalizeTechWhatsAppPrefs((technician as any).whatsapp_prefs),
      salarySlipAutoSend: (technician as any).salary_slip_auto_send === true,
    });
    setNewlyCreatedTechnicianId(null);
    openSettingsPanel('edit-technician', { id: technician.id });
  };

  const handleSaveTechnician = async () => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    try {
      // Password (if provided) is forwarded as plaintext to sync-technician-auth-user,
      // which writes it to Supabase Auth via admin.updateUserById. The DB no longer
      // stores a password hash (column dropped 2026-05-24).

      const dynamicOn = technicianFormData.dynamicUpiEnabled === true;
      const upiId = normalizeUpiId(technicianFormData.upiId || '');
      if (dynamicOn && !isValidUpiId(upiId)) {
        toast.error('Enter a valid UPI ID (e.g. name@oksbi) to enable Dynamic UPI');
        return;
      }
      if (
        technicianFormData.qrCode &&
        !String(technicianFormData.qrCode).startsWith('http')
      ) {
        toast.error('Invalid QR code URL. Please upload the image again.');
        return;
      }

      const previousBaseSalary =
        selectedTechnician?.salary?.baseSalary !== undefined
          ? Number(selectedTechnician.salary.baseSalary)
          : 0;
      const nextBaseSalary = technicianFormData.baseSalary || 0;
      const hasSalaryHistory =
        Array.isArray((selectedTechnician?.salary as any)?.history) &&
        (selectedTechnician?.salary as any).history.length > 0;
      const salaryChanged =
        !editTechnicianDialogOpen ||
        !selectedTechnician ||
        previousBaseSalary !== nextBaseSalary ||
        !hasSalaryHistory;
      const salaryPayload = salaryChanged
        ? buildTechnicianSalaryPayload(
            editTechnicianDialogOpen ? selectedTechnician?.salary : null,
            nextBaseSalary,
            technicianFormData.salaryEffectiveFromMonth
          )
        : {
            ...(selectedTechnician?.salary || {}),
            baseSalary: nextBaseSalary,
            commissionPerJob: selectedTechnician?.salary?.commissionPerJob ?? 0,
            commissionPercentage: selectedTechnician?.salary?.commissionPercentage ?? 10,
          };

      const technicianData: any = {
        full_name: technicianFormData.fullName,
        phone: technicianFormData.phone,
        whatsapp_phone: technicianFormData.whatsappPhone.trim() || null,
        email: technicianFormData.email,
        employee_id: technicianFormData.employeeId,
        qr_code: technicianFormData.qrCode || null,
        photo: technicianFormData.photo || null,
        upi_id: dynamicOn ? upiId : '',
        payee_name: String(technicianFormData.payeeName || '').trim().slice(0, 100),
        upi_phone: normalizePaymentPhone(technicianFormData.upiPhone || ''),
        dynamic_upi_enabled: dynamicOn,
        visible_qr_codes: technicianFormData.visibleQrCodes || [],
        common_qr_code_ids: technicianFormData.commonQrCodeIds || [],
        skills: {
          serviceTypes: ['RO', 'SOFTENER', 'AC', 'APPLIANCE'],
          certifications: [],
          experience: 0,
          rating: 0
        },
        service_areas: {
          pincodes: [],
          cities: ['Bangalore'],
          maxDistance: 10
        },
        work_schedule: {
          workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          startTime: '09:00',
          endTime: '18:00',
          breakTime: {
            start: '13:00',
            end: '14:00'
          }
        },
        salary: salaryPayload,
        updated_at: new Date().toISOString()
      };

      // Duty status (AVAILABLE/BUSY/OFFLINE) is live — only set OFFLINE on create.
      // Editing a tech must not wipe AVAILABLE back to OFFLINE.
      if (editTechnicianDialogOpen && selectedTechnician) {
        technicianData.account_status = technicianFormData.accountStatus || 'ACTIVE';
        technicianData.push_notifications_enabled =
          technicianFormData.pushNotificationsEnabled !== false;
        technicianData.push_prefs = normalizeTechPushPrefs(technicianFormData.pushPrefs);
        technicianData.whatsapp_prefs = normalizeTechWhatsAppPrefs(technicianFormData.whatsappPrefs);
        technicianData.salary_slip_auto_send = technicianFormData.salarySlipAutoSend === true;
      } else {
        technicianData.status = 'OFFLINE';
        technicianData.performance = {
          totalJobs: 0,
          completedJobs: 0,
          averageRating: 0,
          onTimePercentage: 0,
          customerSatisfaction: 0
        };
        technicianData.created_at = new Date().toISOString();
        technicianData.account_status = 'ACTIVE';
        technicianData.push_notifications_enabled = true;
        technicianData.push_prefs = defaultTechPushPrefs();
        technicianData.whatsapp_prefs = defaultTechWhatsAppPrefs();
        technicianData.salary_slip_auto_send = technicianFormData.salarySlipAutoSend === true;
      }

      const password = technicianFormData.password?.trim() || '';
      let savedTechnicianId: string | null = null;

      if (editTechnicianDialogOpen && selectedTechnician) {
        const { error } = await db.technicians.update(selectedTechnician.id, technicianData);
        if (error) throw error;
        savedTechnicianId = selectedTechnician.id;
        toast.success('Technician updated successfully');
      } else {
        // Create new technician — password (for Supabase Auth) is required.
        if (!password) {
          toast.error('Password is required when creating a new technician');
          return;
        }


        // Check for duplicate employee_id or phone before creating
        // OPTIMIZATION: Limit check to recent technicians (duplicates are usually recent)
        const { data: existingTechnicians } = await db.technicians.getAll(500, { activeRosterOnly: false });
        if (existingTechnicians) {
          const duplicateEmployeeId = existingTechnicians.find(
            (t: any) => t.employee_id === technicianData.employee_id
          );
          const duplicatePhone = existingTechnicians.find(
            (t: any) => t.phone === technicianData.phone
          );
          const duplicateEmail = existingTechnicians.find(
            (t: any) => t.email.toLowerCase() === technicianData.email.toLowerCase()
          );
          
          if (duplicateEmployeeId) {
            toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            return;
          }
          if (duplicatePhone) {
            toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            return;
          }
          if (duplicateEmail) {
            toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            return;
          }
        }
        
        const { data: newTechnician, error } = await db.technicians.create(technicianData);
        if (error) {
          // Handle 409 conflict errors with better messages
          if (error.code === '23505') { // PostgreSQL unique violation
            if (error.message.includes('employee_id')) {
              toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            } else if (error.message.includes('phone')) {
              toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            } else if (error.message.includes('email')) {
              toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            } else {
              toast.error('A technician with this information already exists. Please check employee ID, phone, or email.');
            }
            return;
          }
          throw error;
        }
        
        // Store the newly created technician ID to show link
        if (newTechnician && newTechnician.id) {
          savedTechnicianId = newTechnician.id;
          setNewlyCreatedTechnicianId(newTechnician.id);
        }
        
        toast.success('Technician created successfully');
      }

      if (password && savedTechnicianId) {
        const techId = savedTechnicianId;
        const sessionReady = await ensureAdminSupabaseSession();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!sessionReady || !accessToken) {
          toast.warning(
            'Technician saved, but admin session is missing. Log in to admin and re-save the password to set it in Supabase Auth.',
            { duration: 10000 }
          );
        } else {
          try {
            const syncRes = await fetch('/.netlify/functions/sync-technician-auth-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                technicianId: techId,
                email: technicianFormData.email,
                password,
                accessToken,
                fullName: technicianFormData.fullName,
              }),
            });
            if (syncRes.ok) {
              toast.success('Technician login set in Supabase Auth');
            } else {
              const errBody = (await syncRes.json().catch(() => ({}))) as {
                error?: string;
                hint?: string;
              };
              console.warn('Technician auth sync failed:', errBody);
              toast.error(
                errBody.error ||
                  'Failed to set technician password. They will not be able to log in until this is retried.',
                { duration: 10000 }
              );
            }
          } catch (syncErr) {
            console.warn('Technician auth sync error:', syncErr);
            toast.error(
              'Network error while setting technician password. Retry from Settings → Edit Technician.',
              { duration: 10000 }
            );
          }
        }
      }

      // Refresh technicians list
      await loadTechnicians();

      // Don't close dialog if we just created a technician (to show ID card link)
      if (editTechnicianDialogOpen || !newlyCreatedTechnicianId) {
        closeSettingsPanel();
        setSelectedTechnician(null);
        setNewlyCreatedTechnicianId(null);
      }
    } catch (error) {
      console.error('Error saving technician:', error);
      toast.error('Failed to save technician');
    }
  };

  // Common QR Code management functions
  const loadCommonQrCodes = async () => {
    try {
      console.log('Loading common QR codes...');
      const { data, error } = await db.commonQrCodes.getAll();
      if (error) {
        console.error('Error fetching QR codes:', error);
        throw error;
      }
      
      console.log('QR codes fetched:', data);
      
      if (data) {
        const transformed = data
          .map((qr: any) => mapCommonQrRow(qr))
          .filter(Boolean) as CommonQrCode[];
        console.log('Transformed QR codes:', transformed);
        setCommonQrCodes(transformed);
        cacheQrCodes(transformed);
      } else {
        console.log('No QR codes found in database');
        setCommonQrCodes([]);
        cacheQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading common QR codes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load QR codes: ${errorMessage}`);
    }
  };

  const handleAddQrCode = () => {
    setQrCodeFormData({
      name: '',
      qrCodeUrl: '',
      upiId: '',
      payeeName: '',
      phone: '',
      dynamicUpiEnabled: false,
    });
    openSettingsPanel('add-payment-qr');
  };

  const handleEditQrCode = (qrCode: CommonQrCode) => {
    setSelectedQrCode(qrCode);
    setQrCodeFormData({
      name: qrCode.name,
      qrCodeUrl: qrCode.qrCodeUrl,
      upiId: qrCode.upiId || '',
      payeeName: qrCode.payeeName || '',
      phone: qrCode.phone || '',
      dynamicUpiEnabled: !!qrCode.dynamicUpiEnabled,
    });
    openSettingsPanel('edit-payment-qr', { id: qrCode.id });
  };

  const handleSaveQrCode = async () => {
    try {
      if (!qrCodeFormData.name || !qrCodeFormData.name.trim()) {
        toast.error('Please provide a QR code name');
        return;
      }

      const dynamicOn = qrCodeFormData.dynamicUpiEnabled === true;
      const upiId = normalizeUpiId(qrCodeFormData.upiId);
      if (dynamicOn) {
        if (!isValidUpiId(upiId)) {
          toast.error('Enter a valid UPI ID (e.g. business@oksbi) to enable dynamic QR');
          return;
        }
      }

      const hasImage =
        !!qrCodeFormData.qrCodeUrl &&
        qrCodeFormData.qrCodeUrl.trim() !== '' &&
        qrCodeFormData.qrCodeUrl.startsWith('http');

      if (!dynamicOn && !hasImage) {
        toast.error('Please upload a QR code image');
        return;
      }

      if (qrCodeFormData.qrCodeUrl && !qrCodeFormData.qrCodeUrl.startsWith('http')) {
        toast.error('Invalid QR code URL. Please upload the image again.');
        return;
      }

      const payload = {
        name: qrCodeFormData.name.trim(),
        qr_code_url: hasImage ? qrCodeFormData.qrCodeUrl.trim() : '',
        upi_id: upiId,
        payee_name: String(qrCodeFormData.payeeName || '').trim().slice(0, 100),
        phone: normalizePaymentPhone(qrCodeFormData.phone || ''),
        dynamic_upi_enabled: dynamicOn,
      };

      if (editQrCodeDialogOpen && selectedQrCode) {
        const { data, error } = await db.commonQrCodes.update(selectedQrCode.id, payload);
        if (error) {
          console.error('Error updating QR code:', error);
          toast.error(`Failed to update QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code updated successfully:', data);
        toast.success('QR code updated successfully');
        invalidateQrCodesCache();
      } else {
        const { data, error } = await db.commonQrCodes.create(payload);
        if (error) {
          console.error('Error creating QR code:', error);
          toast.error(`Failed to create QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code created successfully:', data);
        toast.success('QR code created successfully');
        invalidateQrCodesCache();
      }

      await loadCommonQrCodes();
      
      closeSettingsPanel();
      setSelectedQrCode(null);
      setQrCodeFormData({
        name: '',
        qrCodeUrl: '',
        upiId: '',
        payeeName: '',
        phone: '',
        dynamicUpiEnabled: false,
      });
    } catch (error) {
      console.error('Error saving QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to save QR code: ${errorMessage}`);
    }
  };

  const handleDeleteQrCode = async (qrCodeId: string) => {
    try {
      const { error } = await db.commonQrCodes.delete(qrCodeId);
      if (error) throw error;
      
      await loadCommonQrCodes();
      toast.success('QR code deleted successfully');
      // Invalidate cache so AdminDashboard will reload
      invalidateQrCodesCache();
    } catch (error) {
      console.error('Error deleting QR code:', error);
      toast.error('Failed to delete QR code');
    }
  };

  const handleGenerateStyledQrImage = async () => {
    const content = qrImageGeneratorData.content.trim();
    if (!content) {
      toast.error('Enter the link or text for the QR code');
      return;
    }

    setIsGeneratingQrImage(true);
    try {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      const qrSize = 760;

      const qrCode = new QRCodeStyling({
        width: qrSize,
        height: qrSize,
        type: 'canvas',
        data: content,
        margin: 18,
        qrOptions: {
          errorCorrectionLevel: 'H'
        },
        dotsOptions: {
          color: '#000000',
          type: 'dots'
        },
        cornersSquareOptions: {
          color: '#000000',
          type: 'square'
        },
        cornersDotOptions: {
          color: '#000000',
          type: 'square'
        },
        backgroundOptions: {
          color: '#ffffff'
        }
      });

      const rawData = await qrCode.getRawData('png');
      const blob = rawData instanceof Blob ? rawData : new Blob([rawData as BlobPart], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = (qrImageGeneratorData.fileName.trim() || 'hydrogen-ro-qr')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      link.href = objectUrl;
      link.download = `${safeFileName || 'hydrogen-ro-qr'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success('QR image downloaded');
    } catch (error) {
      console.error('Error generating styled QR image:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate QR image');
    } finally {
      setIsGeneratingQrImage(false);
    }
  };

  // Common QR (non-payment) management functions
  const loadTechnicianCommonQrCodes = async () => {
    try {
      const { data, error } = await db.technicianCommonQr.getNames();
      if (error) throw error;
      if (data) {
        const transformed = data.map((qr: { id: string; name: string }) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: '',
          createdAt: '',
          updatedAt: '',
        }));
        setTechnicianCommonQrCodes(transformed);
      } else {
        setTechnicianCommonQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading technician common QR codes:', error);
      setTechnicianCommonQrCodes([]);
    }
  };

  const loadTechnicianCommonQrForEdit = async (id: string, fallbackName?: string) => {
    try {
      const { data, error } = await db.technicianCommonQr.getById(id);
      if (error) throw error;
      if (!data) return;
      const full: CommonQrCode = {
        id: data.id,
        name: data.name,
        qrCodeUrl: data.qr_code_url || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setSelectedTechnicianCommonQr(full);
      setTechnicianCommonQrFormData({ name: full.name, qrCodeUrl: full.qrCodeUrl });
    } catch (error) {
      console.error('Error loading Common QR for edit:', error);
      if (fallbackName) {
        setTechnicianCommonQrFormData((prev) => ({ ...prev, name: fallbackName }));
      }
      toast.error('Failed to load QR image for editing');
    }
  };

  const handleAddTechnicianCommonQr = () => {
    setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
    openSettingsPanel('add-tech-qr');
  };

  const handleEditTechnicianCommonQr = (qrCode: CommonQrCode) => {
    setSelectedTechnicianCommonQr(qrCode);
    setTechnicianCommonQrFormData({ name: qrCode.name, qrCodeUrl: '' });
    openSettingsPanel('edit-tech-qr', { id: qrCode.id });
  };

  // List is names-only; fetch image URL when edit panel opens.
  useEffect(() => {
    const parsed = parseSettingsUrl(location.search);
    if (parsed.panel !== 'edit-tech-qr' || !parsed.panelId) return;
    if (technicianCommonQrFormData.qrCodeUrl) return;
    void loadTechnicianCommonQrForEdit(parsed.panelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per edit-panel open
  }, [location.search]);

  const handleSaveTechnicianCommonQr = async () => {
    try {
      if (!technicianCommonQrFormData.name?.trim()) {
        toast.error('Please provide a name');
        return;
      }
      if (!technicianCommonQrFormData.qrCodeUrl?.trim() || !technicianCommonQrFormData.qrCodeUrl.startsWith('http')) {
        toast.error('Please upload a valid QR code image');
        return;
      }
      if (editTechnicianCommonQrDialogOpen && selectedTechnicianCommonQr) {
        const { error } = await db.technicianCommonQr.update(selectedTechnicianCommonQr.id, {
          name: technicianCommonQrFormData.name.trim(),
          qr_code_url: technicianCommonQrFormData.qrCodeUrl.trim()
        });
        if (error) throw error;
        toast.success('Common QR updated successfully');
      } else {
        const { error } = await db.technicianCommonQr.create({
          name: technicianCommonQrFormData.name.trim(),
          qr_code_url: technicianCommonQrFormData.qrCodeUrl.trim()
        });
        if (error) throw error;
        toast.success('Common QR created successfully');
      }
      await loadTechnicianCommonQrCodes();
      closeSettingsPanel();
      setSelectedTechnicianCommonQr(null);
      setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
    } catch (error) {
      console.error('Error saving technician common QR:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save Common QR');
    }
  };

  const handleDeleteTechnicianCommonQr = async (qrCodeId: string) => {
    try {
      const { error } = await db.technicianCommonQr.delete(qrCodeId);
      if (error) throw error;
      await loadTechnicianCommonQrCodes();
      toast.success('Common QR deleted successfully');
    } catch (error) {
      console.error('Error deleting technician common QR:', error);
      toast.error('Failed to delete Common QR');
    }
  };

  // Product QR Code management functions
  const loadProductQrCodes = async () => {
    try {
      const { data, error } = await db.productQrCodes.getNames();
      if (error) throw error;

      if (data) {
        setProductQrCodes(
          data.map((qr: { id: string; name: string }) => ({
            id: qr.id,
            name: qr.name,
            qrCodeUrl: '',
            productImageUrl: '',
            productName: '',
            productDescription: '',
            productMrp: '',
            createdAt: '',
            updatedAt: '',
          }))
        );
      } else {
        setProductQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading product QR codes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load product QR codes: ${errorMessage}`);
    }
  };

  const loadProductQrForEdit = async (id: string, fallbackName?: string) => {
    try {
      const { data, error } = await db.productQrCodes.getById(id);
      if (error) throw error;
      if (!data) return;
      const full = {
        id: data.id,
        name: data.name,
        qrCodeUrl: data.qr_code_url || '',
        productImageUrl: data.product_image_url || '',
        productName: data.product_name || '',
        productDescription: data.product_description || '',
        productMrp: data.product_mrp || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setSelectedProductQrCode(full);
      setProductQrCodeFormData({
        name: full.name || '',
        qrCodeUrl: full.qrCodeUrl,
        productImageUrl: full.productImageUrl,
        productName: full.productName,
        productDescription: full.productDescription,
        productMrp: full.productMrp != null ? String(full.productMrp) : '',
      });
    } catch (error) {
      console.error('Error loading product QR for edit:', error);
      if (fallbackName) {
        setProductQrCodeFormData((prev) => ({ ...prev, name: fallbackName }));
      }
      toast.error('Failed to load product QR for editing');
    }
  };

  const handleAddProductQrCode = () => {
    setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
    openSettingsPanel('add-product-qr');
  };

  const handleEditProductQrCode = (qrCode: any) => {
    setSelectedProductQrCode(qrCode);
    setProductQrCodeFormData({
      name: qrCode.name || '',
      qrCodeUrl: '',
      productImageUrl: '',
      productName: '',
      productDescription: '',
      productMrp: '',
    });
    openSettingsPanel('edit-product-qr', { id: qrCode.id });
  };

  // List is names-only; fetch full row when edit panel opens.
  useEffect(() => {
    const parsed = parseSettingsUrl(location.search);
    if (parsed.panel !== 'edit-product-qr' || !parsed.panelId) return;
    void loadProductQrForEdit(parsed.panelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per edit-panel open
  }, [location.search]);

  const handleSaveProductQrCode = async () => {
    try {
      // Validate form data
      if (!productQrCodeFormData.name || !productQrCodeFormData.name.trim()) {
        toast.error('Please provide a QR code name');
        return;
      }

      let qrCodeUrlToSave = productQrCodeFormData.qrCodeUrl;

      // If no QR code uploaded, generate one automatically from the verification link
      if (!qrCodeUrlToSave || !qrCodeUrlToSave.trim()) {
        // We need to create the entry first to get the ID, then generate QR code
        // For now, we'll generate a temporary link and update it after creation
        toast.info('Generating QR code automatically...');
      }

      console.log('Saving product QR code:', { 
        name: productQrCodeFormData.name, 
        qrCodeUrl: qrCodeUrlToSave,
        productName: productQrCodeFormData.productName,
        productDescription: productQrCodeFormData.productDescription
      });

      let createdQrCodeId: string | null = null;

      if (editProductQrCodeDialogOpen && selectedProductQrCode) {
        // Update existing - generate QR code if not provided
        if (!qrCodeUrlToSave || !qrCodeUrlToSave.trim() || !qrCodeUrlToSave.startsWith('http')) {
          const verificationLink = generateProductVerificationLink(selectedProductQrCode.id);
          qrCodeUrlToSave = generateQrCodeImageUrl(verificationLink);
        }

        console.log('Updating product QR code with ID:', selectedProductQrCode.id);
        const { data, error } = await db.productQrCodes.update(selectedProductQrCode.id, {
          name: productQrCodeFormData.name.trim(),
          qr_code_url: qrCodeUrlToSave.trim(),
          product_image_url: productQrCodeFormData.productImageUrl.trim() || null,
          product_name: productQrCodeFormData.productName.trim() || null,
          product_description: productQrCodeFormData.productDescription.trim() || null,
          product_mrp: productQrCodeFormData.productMrp.trim() || null
        });
        if (error) {
          console.error('Error updating product QR code:', error);
          toast.error(`Failed to update product QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('Product QR code updated successfully:', data);
        toast.success('Product QR code updated successfully');
      } else {
        // Create new - first create entry, then generate QR code
        console.log('Creating new product QR code...');
        const { data, error } = await db.productQrCodes.create({
          name: productQrCodeFormData.name.trim(),
          qr_code_url: qrCodeUrlToSave.trim() || '', // Temporary, will update
          product_image_url: productQrCodeFormData.productImageUrl.trim() || undefined,
          product_name: productQrCodeFormData.productName.trim() || undefined,
          product_description: productQrCodeFormData.productDescription.trim() || undefined,
          product_mrp: productQrCodeFormData.productMrp.trim() || undefined
        });
        if (error) {
          console.error('Error creating product QR code:', error);
          toast.error(`Failed to create product QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }

        if (data && data.id) {
          createdQrCodeId = data.id;
          // Generate QR code from verification link
          const verificationLink = generateProductVerificationLink(data.id);
          const generatedQrCodeUrl = generateQrCodeImageUrl(verificationLink);
          
          // Update with generated QR code
          const { error: updateError } = await db.productQrCodes.update(data.id, {
            qr_code_url: generatedQrCodeUrl
          });
          
          if (updateError) {
            console.error('Error updating QR code URL:', updateError);
            // Don't fail - QR code was created, just URL generation failed
          }
        }

        console.log('Product QR code created successfully:', data);
        toast.success('Product QR code created successfully');
      }

      // Reload product QR codes after successful save
      console.log('Reloading product QR codes...');
      await loadProductQrCodes();
      
      closeSettingsPanel();
      setSelectedProductQrCode(null);
      setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
    } catch (error) {
      console.error('Error saving product QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Full error:', error);
      toast.error(`Failed to save product QR code: ${errorMessage}`);
    }
  };

  const handleDeleteProductQrCode = async (qrCodeId: string) => {
    try {
      const { error } = await db.productQrCodes.delete(qrCodeId);
      if (error) throw error;
      
      await loadProductQrCodes();
      toast.success('Product QR code deleted successfully');
    } catch (error) {
      console.error('Error deleting product QR code:', error);
      toast.error('Failed to delete product QR code');
    }
  };

  // Generate product verification link for QR code
  const generateProductVerificationLink = (qrCodeId: string): string => {
    return `${window.location.origin}/product-verify/${qrCodeId}`;
  };

  // Generate QR code image URL from verification link
  const generateQrCodeImageUrl = (link: string): string => {
    // Using QR Server API (free, no API key needed)
    const encodedLink = encodeURIComponent(link);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedLink}`;
  };

  // Todo management functions
  const loadTodos = async () => {
    try {
      const { data, error } = await db.adminTodos.getAll();
      if (error) throw error;
      
      if (data) {
        setTodos(data);
      } else {
        setTodos([]);
      }
    } catch (error) {
      console.error('Error loading todos:', error);
      toast.error('Failed to load todos');
    }
  };

  const handleAddTodo = () => {
    setNewTodoText('');
    openSettingsPanel('add-todo');
  };

  const handleSaveTodo = async () => {
    try {
      if (!newTodoText || !newTodoText.trim()) {
        toast.error('Please enter a task');
        return;
      }

      const { data, error } = await db.adminTodos.create({ text: newTodoText.trim() });
      if (error) throw error;
      
      toast.success('Task added successfully');
      await loadTodos();
      closeSettingsPanel();
      setNewTodoText('');
    } catch (error: any) {
      console.error('Error saving todo:', error);
      console.error('Error details:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        fullError: JSON.stringify(error, null, 2)
      });
      
      if (error?.code === '42501') {
        toast.error('Permission denied. Please run the RLS fix SQL script in Supabase.');
      } else {
        const errorMsg = error?.message || error?.details || 'Unknown error';
        toast.error('Failed to add task: ' + errorMsg);
      }
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    try {
      const { error } = await db.adminTodos.delete(todoId);
      if (error) throw error;
      
      toast.success('Task completed');
      await loadTodos();
      setTodoToDelete(null);
    } catch (error) {
      console.error('Error deleting todo:', error);
      toast.error('Failed to complete task');
      setTodoToDelete(null);
    }
  };

  const handleTodoCheckboxClick = (todoId: string) => {
    setTodoToDelete(todoId);
  };

  const parseTrackerAmount = (value: unknown): number => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const formatTrackerAmount = (amount: number): string => {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const loadAmountTrackers = async () => {
    try {
      const { data, error } = await db.amountTrackers.getAll();
      if (error) throw error;

      setAmountTrackers(
        (data || []).map((row: any) => ({
          id: row.id as string,
          name: (row.name as string) || 'Untitled',
          amount: parseTrackerAmount(row.amount),
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }))
      );
    } catch (error) {
      console.error('Error loading amount trackers:', error);
      toast.error('Failed to load trackers');
    }
  };

  const handleAddTracker = () => {
    setNewTrackerName('');
    setNewTrackerAmount('');
    openSettingsPanel('add-tracker');
  };

  const handleSaveTracker = async () => {
    try {
      const name = newTrackerName.trim();
      if (!name) {
        toast.error('Please enter a name');
        return;
      }

      const amount = newTrackerAmount.trim() === '' ? 0 : parseFloat(newTrackerAmount);
      if (!Number.isFinite(amount)) {
        toast.error('Please enter a valid starting amount');
        return;
      }

      const { error } = await db.amountTrackers.create({ name, amount });
      if (error) throw error;

      toast.success('Tracker created');
      await loadAmountTrackers();
      closeSettingsPanel();
      setNewTrackerName('');
      setNewTrackerAmount('');
    } catch (error: any) {
      console.error('Error saving tracker:', error);
      const errorMsg = error?.message || error?.details || 'Unknown error';
      toast.error('Failed to create tracker: ' + errorMsg);
    }
  };

  const handleAdjustTracker = async (trackerId: string, direction: 'add' | 'subtract') => {
    if (adjustingTrackerId) return;

    const raw = (adjustInputs[trackerId] || '').trim();
    if (!raw) {
      toast.error('Enter an amount first');
      return;
    }

    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }

    const delta = direction === 'add' ? value : -value;
    setAdjustingTrackerId(trackerId);

    try {
      const { data, error } = await db.amountTrackers.adjust(trackerId, delta);
      if (error) throw error;

      const row = data as { id?: string; name?: string; amount?: unknown; updated_at?: string } | null;
      if (row?.id) {
        setAmountTrackers((prev) =>
          prev.map((t) =>
            t.id === row.id
              ? {
                  ...t,
                  amount: parseTrackerAmount(row.amount),
                  updated_at: (row.updated_at as string) || t.updated_at,
                }
              : t
          )
        );
      } else {
        await loadAmountTrackers();
      }

      setAdjustInputs((prev) => ({ ...prev, [trackerId]: '' }));
      toast.success(direction === 'add' ? 'Amount added' : 'Amount subtracted');
    } catch (error) {
      console.error('Error adjusting tracker:', error);
      toast.error('Failed to update amount');
    } finally {
      setAdjustingTrackerId(null);
    }
  };

  const handleDeleteTracker = async (trackerId: string) => {
    try {
      const { error } = await db.amountTrackers.delete(trackerId);
      if (error) throw error;

      toast.success('Tracker deleted');
      await loadAmountTrackers();
      setTrackerToDelete(null);
    } catch (error) {
      console.error('Error deleting tracker:', error);
      toast.error('Failed to delete tracker');
      setTrackerToDelete(null);
    }
  };

  const ensureSettingsSectionLoaded = useCallback((key: SettingsLazySection) => {
    if (settingsLazyStartedRef.current[key]) return;
    settingsLazyStartedRef.current[key] = true;

    if (key === 'todos') {
      void loadTodos();
      return;
    }
    if (key === 'trackers') {
      void loadAmountTrackers();
      return;
    }
    if (key === 'commonQr') {
      const cached = getCachedQrCodes();
      if (cached) {
        setCommonQrCodes(cached);
        return;
      }
      void loadCommonQrCodes();
      return;
    }
    if (key === 'techQr') {
      void loadTechnicianCommonQrCodes();
      return;
    }
    void loadProductQrCodes();
  }, []);
  ensureSettingsSectionLoadedRef.current = ensureSettingsSectionLoaded;

  // Locations + management need technicians on open; defer QR / todos / trackers.
  useEffect(() => {
    void loadTechnicians();
  }, []);

  useEffect(() => {
    if (
      showCallingPage ||
      showWhatsAppInboxPage ||
      showWhatsAppSettingsPage ||
      showPdfAuthenticityPage ||
      showJobReviewsPage ||
      showDbStoragePage ||
      showAiUsagePage ||
      showRecurringServicePage ||
      showLeadCatalogPage
    ) {
      return;
    }

    const pairs: Array<[SettingsLazySection, React.RefObject<HTMLDivElement | null>]> = [
      ['todos', todosSectionRef],
      ['trackers', trackersSectionRef],
      ['commonQr', commonQrSectionRef],
      ['techQr', techQrSectionRef],
      ['productQr', productQrSectionRef],
    ];

    if (typeof IntersectionObserver === 'undefined') {
      pairs.forEach(([key]) => ensureSettingsSectionLoaded(key));
      return;
    }

    const observers: IntersectionObserver[] = [];
    for (const [key, ref] of pairs) {
      const el = ref.current;
      if (!el) continue;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            ensureSettingsSectionLoaded(key);
            obs.disconnect();
          }
        },
        { rootMargin: '240px 0px', threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [
    ensureSettingsSectionLoaded,
    showCallingPage,
    showWhatsAppInboxPage,
    showWhatsAppSettingsPage,
    showPdfAuthenticityPage,
    showJobReviewsPage,
    showDbStoragePage,
    showAiUsagePage,
    showRecurringServicePage,
    showLeadCatalogPage,
  ]);

  // Deep-link / panel open: fetch only what that panel needs.
  useEffect(() => {
    const panel = parseSettingsUrl(location.search).panel;
    if (!panel) return;

    if (
      panel === 'add-technician' ||
      panel === 'edit-technician' ||
      panel === 'add-payment-qr' ||
      panel === 'edit-payment-qr'
    ) {
      ensureSettingsSectionLoaded('commonQr');
    }
    if (
      panel === 'add-technician' ||
      panel === 'edit-technician' ||
      panel === 'add-tech-qr' ||
      panel === 'edit-tech-qr'
    ) {
      ensureSettingsSectionLoaded('techQr');
    }
    if (panel === 'add-product-qr' || panel === 'edit-product-qr') {
      ensureSettingsSectionLoaded('productQr');
    }
    if (panel === 'add-todo') ensureSettingsSectionLoaded('todos');
    if (panel === 'add-tracker') ensureSettingsSectionLoaded('trackers');
  }, [location.search, ensureSettingsSectionLoaded]);

  // Helper function to convert data to CSV
  const convertToCSV = (data: any[], tableName: string): string => {
    if (!data || data.length === 0) {
      return `Table: ${tableName}\nNo data available\n`;
    }

    // Get all unique keys from all objects
    const allKeys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });

    const headers = Array.from(allKeys);
    
    // Create CSV header
    const csvHeader = headers.map(header => {
      // Escape commas and quotes in header
      const escaped = String(header).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(',');

    // Create CSV rows
    const csvRows = data.map(item => {
      return headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) {
          return '""';
        }
        // Convert objects/arrays to JSON string
        if (typeof value === 'object') {
          const jsonStr = JSON.stringify(value).replace(/"/g, '""');
          return `"${jsonStr}"`;
        }
        // Escape commas and quotes in value
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    return [csvHeader, ...csvRows].join('\n');
  };

  // Helper function to download a file
  const downloadFile = (content: string, filename: string, mimeType: string = 'text/csv') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadExportTableCatalog = useCallback(async (): Promise<ExportTableSpec[]> => {
    const { data, error } = await supabase.rpc('admin_list_export_tables');
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    const catalog = list
      .map((row: { name?: string; order_by?: string }) => {
        const name = String(row?.name || '').trim();
        if (!name) return null;
        return {
          name,
          orderBy: String(row?.order_by || '').trim() || 'id',
          label: exportTableLabel(name),
        } satisfies ExportTableSpec;
      })
      .filter((row): row is ExportTableSpec => Boolean(row));
    setExportTableCatalog(catalog);
    return catalog;
  }, []);

  useEffect(() => {
    if (isManager) return;
    void loadExportTableCatalog().catch(() => {
      /* listed on download */
    });
  }, [isManager, loadExportTableCatalog]);

  const fetchAllFromTable = async (tableName: string, orderBy = 'id'): Promise<{ data: any[]; error: any }> => {
    const PAGE = 1000;
    let offset = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase.rpc('admin_export_table_rows', {
        p_table: tableName,
        p_order_by: orderBy || null,
        p_offset: offset,
        p_limit: PAGE,
      });
      if (error) return { data: [], error };
      const payload = (data || {}) as { rows?: unknown[]; has_more?: boolean };
      const rows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(data) ? data : [];
      all.push(...rows);
      if (!payload.has_more || rows.length < PAGE) break;
      offset += PAGE;
    }
    return { data: all, error: null };
  };

  // Function to download all table data (paginated so we get every row)
  const handleDownloadAllData = async () => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setIsDownloading(true);
    setDownloadProgress('');

    try {
      const catalog =
        exportTableCatalog.length > 0 ? exportTableCatalog : await loadExportTableCatalog();
      if (catalog.length === 0) {
        toast.error('Could not load the live table list for export');
        return;
      }
      const timestamp = new Date().toISOString().split('T')[0];
      const tables: { name: string; data: any[] }[] = [];
      const failedTables: string[] = [];
      const total = catalog.length;

      for (let i = 0; i < catalog.length; i++) {
        const { name, orderBy } = catalog[i];
        setDownloadProgress(`${i + 1}/${total} ${name}`);
        const { data, error } = await fetchAllFromTable(name, orderBy);
        if (error) {
          failedTables.push(name);
          toast.error(`Failed to fetch ${name}: ${error.message}`);
          continue;
        }
        tables.push({ name, data: data || [] });
      }

      // Create ZIP file with all CSV files
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      
      // Add each table as a CSV file to the ZIP
      for (const table of tables) {
        const csvContent = convertToCSV(table.data, table.name);
        const filename = `${table.name}_${timestamp}.csv`;
        zip.file(filename, csvContent);
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download the ZIP file
      const zipFilename = `database_export_${timestamp}.zip`;
      const zipUrl = URL.createObjectURL(zipBlob);
      const zipLink = document.createElement('a');
      zipLink.href = zipUrl;
      zipLink.download = zipFilename;
      document.body.appendChild(zipLink);
      zipLink.click();
      document.body.removeChild(zipLink);
      URL.revokeObjectURL(zipUrl);

      if (failedTables.length > 0) {
        toast.warning(
          `Downloaded ${tables.length} table(s); failed: ${failedTables.join(', ')}`
        );
      } else {
        toast.success(
          `Successfully downloaded ${tables.length} table(s) in ZIP file: ${zipFilename}`
        );
      }
    } catch (error) {
      console.error('Error downloading data:', error);
      toast.error('Failed to download data. Please try again.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress('');
    }
  };



  // Note: Currently allows unauthenticated access, but RLS policies need to be updated
  // Run supabase-qr-codes-rls-fix.sql to allow unauthenticated access


  // Show calling page if requested
  if (showCallingPage) {
    return (
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Calling</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">Manage customer calls</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <CallingPage
            hideHeader={true}
            onBack={closeSettingsPanel}
          />
        </div>
      </div>
    );
  }

  if (showDbStoragePage) {
    return (
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    Storage
                  </h1>
                  <p className="text-xs text-muted-foreground truncate sm:hidden">
                    Postgres, Cloudflare R2, and Cloudinary
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2 self-start sm:self-auto cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-5 sm:py-8 pb-10 max-w-6xl">
          <DbStorageStatsPage hideHeader onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showAiUsagePage) {
    return (
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    AI usage & models
                  </h1>
                  <p className="text-xs text-muted-foreground truncate sm:hidden">
                    Limits, tokens, and model selection
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2 self-start sm:self-auto cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-5 sm:py-8 pb-10 max-w-3xl">
          <AiUsagePage hideHeader onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showJobReviewsPage) {
    return (
      <div className="admin-page min-h-[100dvh] bg-gradient-to-b from-amber-50/40 via-background to-background">
        <div className="bg-card/90 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3.5 sm:py-0 sm:h-16">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                  <Star className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    Customer reviews
                  </h1>
                  <p className="text-xs text-muted-foreground truncate sm:hidden">
                    Linked to the technician on each job
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2 self-start sm:self-auto cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-5 sm:py-8 pb-10 max-w-3xl">
          <JobReviewsPage hideHeader onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showPdfAuthenticityPage) {
    return (
      <div className="admin-page min-h-[100dvh] bg-gradient-to-b from-emerald-50/40 via-background to-background">
        <div className="bg-card/90 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3.5 sm:py-0 sm:h-16">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    Verify PDF authenticity
                  </h1>
                  <p className="text-xs text-muted-foreground truncate sm:hidden">
                    AMC · bills · invoices · more
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2 self-start sm:self-auto cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-5 sm:py-8 pb-10">
          <PdfAuthenticityVerifyPage hideHeader onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showPrivacyCenterPage) {
    return (
      <div className="admin-page">
        <div className="container mx-auto px-4 py-5 sm:py-8 pb-10">
          <PrivacyCenterPage onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showWhatsAppSettingsPage) {
    return (
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <img
                  src="/whatsapp.png"
                  alt=""
                  className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3 shrink-0 rounded-md object-contain"
                  width={32}
                  height={32}
                />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">WhatsApp settings</h1>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <WhatsAppSettingsPage
            hideHeader
            onBack={closeSettingsPanel}
          />
        </div>
      </div>
    );
  }

  if (showWhatsAppInboxPage) {
    const exitWhatsAppInboxToHome = () => {
      navigate('/admin', { replace: true });
    };
    // Header Back always goes to admin home (not chat list / settings).
    const handleWhatsAppChromeBack = () => {
      exitWhatsAppInboxToHome();
    };
    return (
      <div className="admin-page flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#0b141a]">
        <div className="flex shrink-0 items-center gap-2 border-b border-[#2a3942] bg-[#111b21] px-3 py-2.5 sm:px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleWhatsAppChromeBack}
            className="h-9 shrink-0 cursor-pointer text-[#8696a0] hover:bg-white/5 hover:text-[#e9edef]"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <WhatsAppLogo size={18} className="text-[#e9edef]" />
            <span className="text-sm font-semibold tracking-tight text-[#e9edef]">Inbox</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <WhatsAppInboxPage
            hideHeader
            onBack={exitWhatsAppInboxToHome}
            initialPhone={parseSettingsUrl(location.search).panelId}
          />
        </div>
      </div>
    );
  }

  if (showLeadCatalogPage) {
    return (
      <div className="admin-page min-h-screen bg-background">
        <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
          <LeadCatalogSettingsPage onBack={closeSettingsPanel} />
        </div>
      </div>
    );
  }

  if (showRecurringServicePage) {
    return (
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <Repeat className="w-6 h-6 sm:w-8 sm:h-8 text-sky-700 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Recurring Service</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    6-month / yearly service reminders
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettingsPanel}
                className="text-muted-foreground hover:text-foreground -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-4 sm:py-8 flex flex-col min-h-[70vh]">
          <RecurringServiceTracker variant="page" />
        </div>
      </div>
    );
  }

  const activeTechniciansList = technicians.filter((t) => t.account_status !== 'INACTIVE');
  const inactiveTechniciansList = technicians.filter((t) => t.account_status === 'INACTIVE');

  const renderTechnicianCard = (technician: Technician) => (
    <Card key={technician.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{technician.fullName}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{technician.employeeId}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge
              variant={technician.account_status === 'ACTIVE' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {technician.account_status}
            </Badge>
            {technician.push_notifications_enabled === false ? (
              <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300">
                Push off
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground mb-4">
          <div className="flex items-start gap-2">
            <span className="font-medium shrink-0">Email:</span>
            <span className="truncate">{technician.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium shrink-0">Contact:</span>
            <span className="truncate">{technician.phone}</span>
          </div>
          {technician.whatsappPhone ? (
            <div className="flex items-center gap-2">
              <span className="font-medium shrink-0">Admin WA:</span>
              <span className="truncate">{technician.whatsappPhone}</span>
            </div>
          ) : null}
        </div>

        <div className="mb-3">
          <TechnicianIdCardLinks technicianId={technician.id} />
        </div>

        {!isManager ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditTechnician(technician)}
          className="w-full text-xs sm:text-sm"
        >
          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
          Edit
        </Button>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <div className="admin-page">
      {/* Header - sticky so Back stays visible when scrolling */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3 py-3 sm:h-16 sm:flex-nowrap sm:py-0">
            <div className="flex items-center">
              <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground">Settings</h1>
              </div>
            </div>

            <div className="order-3 w-full sm:order-none sm:ml-auto sm:w-auto">
              <SettingsSearch isManager={isManager} openPanel={openSettingsPanel} />
            </div>

            <div className="ml-auto flex items-center sm:ml-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="text-muted-foreground hover:text-foreground -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Technician Locations */}
          <Card id="section-technician-locations" className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <MapPin className="w-5 h-5" />
                    Technician Locations
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    View last known location and update time for all technicians
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTechnicians()}
                  title="Refresh technician locations"
                  className="shrink-0"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {technicians.map((technician) => {
                  const hasLocation = technician.currentLocation && 
                                     technician.currentLocation.latitude && 
                                     technician.currentLocation.longitude;
                  const lastUpdated = technician.currentLocation?.lastUpdated 
                    ? new Date(technician.currentLocation.lastUpdated).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    : null;

                  return (
                    <Card key={technician.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                              {technician.fullName}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">{technician.employeeId}</p>
                          </div>
                        </div>

                        {hasLocation ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                const url = `https://www.google.com/maps?q=${technician.currentLocation?.latitude},${technician.currentLocation?.longitude}`;
                                window.open(url, '_blank');
                              }}
                              className="flex items-center gap-2 w-full p-2 rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
                              title="Click to open location in Google Maps"
                            >
                              <MapPin className="w-5 h-5 text-blue-600 group-hover:text-blue-700 shrink-0" />
                              <div className="flex-1 min-w-0 text-left">
                                <div className="text-xs font-medium text-foreground/90 dark:text-gray-300">
                                  View Location
                                </div>
                              </div>
                            </button>
                            {lastUpdated && (
                              <div className="text-xs text-muted-foreground dark:text-muted-foreground/70">
                                Last updated: {lastUpdated}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground/70 p-2">
                            <MapPin className="w-5 h-5 shrink-0" />
                            <span className="text-xs">No location data available</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {technicians.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    No technicians found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Todo Tasks */}
          <Card id="section-todo-tasks" className="scroll-mt-24" ref={todosSectionRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ListTodo className="w-5 h-5" />
                    Todo Tasks
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage your todo tasks. Check off tasks to complete and delete them.
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddTodo} 
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-border hover:bg-muted/40 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Checkbox
                      id={`todo-${todo.id}`}
                      checked={false}
                      onCheckedChange={() => handleTodoCheckboxClick(todo.id)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`todo-${todo.id}`}
                      className="flex-1 text-sm sm:text-base text-foreground dark:text-gray-100 cursor-pointer"
                    >
                      {todo.text}
                    </label>
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground/70 shrink-0">
                      {new Date(todo.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {todos.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No tasks yet. Click "Add Task" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Amount Trackers */}
          {!isManager ? (
          <Card id="section-amount-trackers" className="scroll-mt-24" ref={trackersSectionRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <DollarSign className="w-5 h-5" />
                    Amount Trackers
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Named running totals — e.g. Cash flow starts at ₹1,000, add ₹100 → ₹1,100.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleAddTracker}
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Tracker
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                {amountTrackers.map((tracker) => (
                  <div
                    key={tracker.id}
                    className="p-4 rounded-lg border border-border dark:border-gray-700 hover:border-border dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg text-foreground dark:text-gray-100 truncate">
                          {tracker.name}
                        </h3>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground/70 mt-0.5">
                          Updated {new Date(tracker.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{formatTrackerAmount(tracker.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={adjustInputs[tracker.id] || ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          setAdjustInputs((prev) => ({ ...prev, [tracker.id]: v }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && adjustInputs[tracker.id]?.trim()) {
                            handleAdjustTracker(tracker.id, 'add');
                          }
                        }}
                        className="flex-1"
                        disabled={adjustingTrackerId === tracker.id}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleAdjustTracker(tracker.id, 'add')}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          {adjustingTrackerId === tracker.id ? '…' : '+ Add'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                          onClick={() => handleAdjustTracker(tracker.id, 'subtract')}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          {adjustingTrackerId === tracker.id ? '…' : '− Subtract'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 shrink-0"
                          onClick={() => setTrackerToDelete(tracker.id)}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {amountTrackers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No trackers yet. Click &quot;New Tracker&quot; to create one (e.g. Cash flow).
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          ) : null}

          {!isManager ? <AdminAppLockSettings /> : null}

          {!isManager ? <DeviceTrackerSettings /> : null}

          {!isManager ? <AppCrashReports /> : null}

          {/* Advanced customer search */}
          <SettingsActionCard
            title="Advanced customer search"
            description='Combine brand, location, service type, AMC, last service date, and more to find customers — like "Livpure in Kasavanahalli or Haralur".'
            icon={<Users />}
            actions={
              <Button
                type="button"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9 sm:shadow-sm"
                onClick={() => openSettingsPanel('advanced-search')}
              >
                <Users className="w-4 h-4 shrink-0" />
                Open advanced search
              </Button>
            }
          />
          <AdvancedCustomerSearchDialog
            open={advancedSearchDialogOpen}
            onOpenChange={bindSettingsPanelDismiss('advanced-search', () => setAdvancedSearchDialogOpen(false))}
          />

          {/* Reminders: add general / customer, then load list dialog */}
          <SettingsActionCard
            sectionId="reminders"
            title="Reminders"
            description="Add a general reminder, one tied to a customer, or load the list to search, filter, and edit."
            icon={<ListTodo />}
            actions={
              <>
                <Button
                  type="button"
                  className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9 sm:shadow-sm"
                  onClick={() => openSettingsPanel('add-general-reminder')}
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  Add general reminder
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                  onClick={() => openSettingsPanel('add-customer-reminder')}
                >
                  <User className="w-4 h-4 shrink-0" />
                  Add customer reminder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                  onClick={() => openSettingsPanel('reminders')}
                >
                  <ListTodo className="w-4 h-4 shrink-0" />
                  Load reminders
                </Button>
              </>
            }
          />
          <AddReminderDialog
            open={addGeneralReminderOpen}
            onOpenChange={bindSettingsPanelDismiss('add-general-reminder', () => setAddGeneralReminderOpen(false))}
            entity={{ type: 'general', id: null }}
            dialogTitle="Add general reminder"
          />
          <AddReminderDialog
            open={addCustomerReminderOpen}
            onOpenChange={bindSettingsPanelDismiss('add-customer-reminder', () => setAddCustomerReminderOpen(false))}
            entity={{ type: 'general', id: null }}
            requireCustomerPick
            dialogTitle="Add customer reminder"
          />
          <SettingsRemindersDialog
            open={remindersDialogOpen}
            onOpenChange={bindSettingsPanelDismiss('reminders', () => setRemindersDialogOpen(false))}
            initialReminderId={remindersInitialReminderId}
          />

          {/* Recurring service tracking */}
          <SettingsActionCard
            title="Recurring Service Tracker"
            description="Dedicated worklist for customers who want service every 6 months or yearly. Call, create a job, view reports, or remove a reminder."
            icon={<Repeat />}
            actions={
              <Button
                type="button"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9 sm:shadow-sm"
                onClick={() => openSettingsPanel('recurring-service')}
              >
                <Repeat className="w-4 h-4 shrink-0" />
                Open tracker
              </Button>
            }
          />

          {/* Pending payments */}
          <Card id="section-pending-payments" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <DollarSign className="w-5 h-5" />
                Pending payments
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Manage customer pending amounts and due dates. Mark as completed after payment.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openSettingsPanel('pending-payments')}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Open Pending Payments
                </Button>
                <Button
                  variant="default"
                  className=" w-full"
                  onClick={() => openSettingsPanel('pending-payments', { action: 'add' })}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pending Payment
                </Button>
              </div>
            </CardContent>
          </Card>
          <SettingsPendingPaymentsDialogV2
            open={pendingPaymentsDialogOpen}
            onOpenChange={bindSettingsPanelDismiss('pending-payments', () => setPendingPaymentsDialogOpen(false))}
            initialAction={pendingPaymentsInitialAction}
            initialReminderId={pendingPaymentsInitialReminderId}
          />

          {!isManager ? (
          <SettingsActionCard
            title="GST Invoices"
            description="View and manage GST invoices"
            icon={<Receipt />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => navigate('/admin?view=gst-invoices')}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                Open GST Invoices
              </Button>
            }
          />
          ) : null}

          {/* AMC View */}
          <SettingsActionCard
            title="View AMCs"
            description="View and manage Annual Maintenance Contracts"
            icon={<FileText />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => navigate('/admin?view=amc-view')}
              >
                <FileText className="w-4 h-4 shrink-0" />
                Open AMC View
              </Button>
            }
          />

          <SettingsActionCard
            title="Customer reviews"
            description="Settings → Customer reviews. Ratings after Complete Job, attached to the technician."
            icon={<Star />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('job-reviews')}
              >
                <Star className="w-4 h-4 shrink-0" />
                Open reviews
              </Button>
            }
          />

          {!isManager ? (
          <SettingsActionCard
            title="Verify PDF authenticity"
            description="Check AMC, bill, quotation, invoice, or warranty PDFs against stored fingerprints"
            icon={<ShieldCheck />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('pdf-authenticity')}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Verify PDF
              </Button>
            }
          />
          ) : null}

          {/* Letterhead Documents / Service Reports */}
          <Card id="section-letterhead-documents" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <FileText className="w-5 h-5" />
                Letterhead Documents
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Build service reports, AMC reports and custom letterhead
                documents on Hydrogen RO or Eleven RO letterhead.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate(
                      '/admin?view=letterhead-documents&type=service_report'
                    )
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Service Report
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate('/admin?view=letterhead-documents&type=amc_report')
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  AMC Report
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate(
                      '/admin?view=letterhead-documents&type=custom_document'
                    )
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Custom Document
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate('/admin?view=letterhead-documents&type=letterhead')
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Create Letterhead
                </Button>
              </div>
            </CardContent>
          </Card>

          {!isManager ? (
          <SettingsActionCard
            sectionId="lead-catalog"
            title="Lead sources & costs"
            description="Manage lead sources, sub-services, default costs, OTP rules — cached locally, not loaded every keystroke"
            icon={<DollarSign className="w-5 h-5" />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('lead-catalog')}
              >
                <DollarSign className="w-4 h-4 shrink-0" />
                Manage catalog
              </Button>
            }
          />
          ) : null}

          {/* Calling */}
          <SettingsActionCard
            sectionId="calling"
            title="Calling"
            description="Manage customer calls and communication"
            icon={<PhoneCall />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('calling')}
              >
                <PhoneCall className="w-4 h-4 shrink-0" />
                Open Calling Page
              </Button>
            }
          />

          {/* WhatsApp Cloud API inbox */}
          <SettingsActionCard
            sectionId="whatsapp-inbox"
            title="WhatsApp"
            description="Inbox, send controls, rate card, and expected Meta bill"
            icon={<img src="/whatsapp.png" alt="" className="w-5 h-5 object-contain" width={20} height={20} />}
            actions={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                  onClick={() => openSettingsPanel('whatsapp-inbox')}
                >
                  <img src="/whatsapp.png" alt="" className="w-4 h-4 object-contain" width={16} height={16} />
                  Open inbox
                </Button>
                {!isManager ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                  onClick={() => openSettingsPanel('whatsapp-settings')}
                >
                  Settings
                </Button>
                ) : null}
              </div>
            }
          />

          {/* Privacy / DSAR (both brands — shared backend) */}
          {!isManager ? (
          <SettingsActionCard
            sectionId="privacy-center"
            title="Privacy Center"
            description="Customer data requests (access / delete), consent register, and security audit — HydrogenRO + ElevenRO"
            icon={<ShieldCheck />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('privacy-center')}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Open Privacy Center
              </Button>
            }
          />
          ) : null}

          {/* Merge duplicate customers */}
          {!isManager ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <GitMerge className="w-5 h-5" />
                    Merge Customers
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Combine two customer records when the same person booked with a different number
                  </CardDescription>
                </div>
                <Button
                  onClick={() => openSettingsPanel('merge-customers')}
                  variant="outline"
                  className="w-full sm:w-auto"
                  size="sm"
                >
                  <GitMerge className="w-4 h-4 mr-2" />
                  Merge duplicate customers
                </Button>
              </div>
            </CardHeader>
          </Card>
          ) : null}

          {/* Warranty Management */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ShieldCheck className="w-5 h-5" />
                    Warranty Management
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Add product & part warranties for a customer. They can self-check status at /warranty by phone.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => openSettingsPanel('warranty')}
                  variant="outline"
                  className="w-full sm:w-auto"
                  size="sm"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Manage warranties
                </Button>
              </div>
            </CardHeader>
          </Card>

          {!isManager ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <DollarSign className="w-5 h-5" />
                    Direct / Office Sales
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Record a counter sale with no customer or technician (e.g. selling a part over the counter)
                  </CardDescription>
                </div>
                <Button
                  onClick={() => openSettingsPanel('direct-sale')}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                  size="sm"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Record direct sale
                </Button>
              </div>
            </CardHeader>
          </Card>
          ) : null}

          {/* Styled QR Image Generator — managers: hide (UPI/payment-adjacent) */}
          {!isManager ? (
          <Card id="section-qr-image-generator" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <QrCode className="w-5 h-5" />
                QR Image Generator
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Create downloadable QR code images with rounded dots and square corner markers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="qr-generator-content">QR link or text</Label>
                  <Input
                    id="qr-generator-content"
                    value={qrImageGeneratorData.content}
                    onChange={(e) => setQrImageGeneratorData((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="https://example.com or UPI/payment text"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="qr-generator-filename">File name</Label>
                  <Input
                    id="qr-generator-filename"
                    value={qrImageGeneratorData.fileName}
                    onChange={(e) => setQrImageGeneratorData((prev) => ({ ...prev, fileName: e.target.value }))}
                    placeholder="hydrogen-ro-qr"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleGenerateStyledQrImage}
                  disabled={isGeneratingQrImage}
                  className=" w-full sm:w-auto"
                >
                  {isGeneratingQrImage ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download QR Image
                </Button>
              </div>
            </CardContent>
          </Card>
          ) : null}

          {/* Common QR Codes Management */}
          {!isManager ? (
          <>
          <Card id="section-payment-qr-codes" className="scroll-mt-24" ref={commonQrSectionRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <QrCode className="w-5 h-5" />
                    Common Payment QR Codes
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage QR codes for technicians. Optionally enable Dynamic UPI so the app
                    generates a live QR with the bill amount from a UPI ID.
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddQrCode} 
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add QR Code
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {commonQrCodes.map((qrCode) => (
                  <Card key={qrCode.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{qrCode.name}</h3>
                          {qrCode.dynamicUpiEnabled && qrCode.upiId ? (
                            <Badge variant="secondary" className="mt-1 text-[10px] sm:text-xs">
                              Dynamic UPI
                            </Badge>
                          ) : null}
                          {qrCode.upiId ? (
                            <p className="text-[11px] text-muted-foreground mt-1 truncate">{qrCode.upiId}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditQrCode(qrCode)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete QR Code</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{qrCode.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteQrCode(qrCode.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {commonQrCodes.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    No QR codes added yet. Click "Add QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* UPI accounts for pending-payment WhatsApp pay links */}
          <Card id="section-upi-payment-accounts" className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <DollarSign className="w-5 h-5" />
                    UPI payment accounts
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Named UPI IDs and payment phone numbers for pending-payment WhatsApp. After you run the SQL setup once, accounts sync across all admin devices.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <UpiPaymentAccountsManager />
            </CardContent>
          </Card>

          {/* Common QR (non-payment) - shown below payment QR on technician app */}
          <Card id="section-common-qr-codes" className="scroll-mt-24" ref={techQrSectionRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <QrCode className="w-5 h-5" />
                    Common QR
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    QR codes shown to technicians below the payment QR. Assign per technician in Technician Management.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleAddTechnicianCommonQr}
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Common QR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                {technicianCommonQrCodes.map((qrCode) => (
                  <div
                    key={qrCode.id}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card"
                  >
                    <h3 className="flex-1 min-w-0 font-medium text-sm sm:text-base text-foreground truncate">
                      {qrCode.name}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTechnicianCommonQr(qrCode)}
                      className="shrink-0 text-xs sm:text-sm"
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-red-600 hover:text-red-700 px-2 sm:px-3"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="mx-4 sm:mx-0">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Common QR</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{qrCode.name}"? Technicians assigned this QR will see none until you assign another.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteTechnicianCommonQr(qrCode.id)}
                            className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {technicianCommonQrCodes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No Common QR added yet. Click "Add Common QR" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Product QR Codes Management */}
          <Card id="section-product-qr-codes" className="scroll-mt-24" ref={productQrSectionRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Package className="w-5 h-5" />
                    Product Verification QR Codes
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage QR codes for product verification. When scanned, these QR codes will show "Genuine Product"
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddProductQrCode} 
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product QR Code
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                {productQrCodes.map((qrCode) => (
                  <div
                    key={qrCode.id}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card"
                  >
                    <h3 className="flex-1 min-w-0 font-medium text-sm sm:text-base text-foreground truncate">
                      {qrCode.name}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Copy verification link"
                      onClick={() => {
                        navigator.clipboard.writeText(generateProductVerificationLink(qrCode.id));
                        toast.success('Verification link copied!');
                      }}
                      className="shrink-0 h-8 w-8 p-0"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditProductQrCode(qrCode)}
                      className="shrink-0 text-xs sm:text-sm"
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-red-600 hover:text-red-700 px-2 sm:px-3"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="mx-4 sm:mx-0">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Product QR Code</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{qrCode.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteProductQrCode(qrCode.id)}
                            className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {productQrCodes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No product QR codes added yet. Click "Add Product QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </>
          ) : null}

          {/* Technician Management */}
            <Card id="section-technician-management" className="scroll-mt-24">
              <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Users className="w-5 h-5" />
                      Technician Management
                    </CardTitle>
                  <CardDescription className="text-sm mt-1">
                      Use Edit → account status to deactivate. Inactive staff stay in the database but are hidden from assignments, maps, Technician Payments, and salary totals.
                    </CardDescription>
                  </div>
                {!isManager ? (
                <Button 
                  onClick={handleAddTechnician}
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Technician
                  </Button>
                ) : null}
                </div>
              </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Active team</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTechniciansList.map((technician) => renderTechnicianCard(technician))}
                </div>
                {activeTechniciansList.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No active technicians yet. Add one above.</p>
                )}
              </div>
              {inactiveTechniciansList.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">Inactive</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Hidden from assignments and maps. Historical jobs and payments are unchanged.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inactiveTechniciansList.map((technician) => renderTechnicianCard(technician))}
                  </div>
                </div>
              )}
            </CardContent>
            </Card>

          {!isManager ? (
          <Card id="section-location-tracking" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <MapPin className="w-5 h-5" />
                Location Tracking Settings
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Control whether technicians' current location is automatically tracked and updated
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Enable Location Tracking
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    When enabled, technicians' location will be automatically updated when they open the app or refresh the page. 
                    This helps calculate distances to customer locations.
                  </p>
                </div>
                <Switch
                  checked={locationTrackingEnabled}
                  onCheckedChange={handleLocationTrackingToggle}
                  className="ml-6 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>
            </CardContent>
          </Card>
          ) : null}

          <Card id="section-dashboard">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <CalendarPlus className="w-5 h-5" />
                Dashboard Settings
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Dashboard display, PDF compression, and job WhatsApp preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Follow-up glow highlights
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    This device only. When enabled, the Followup stats card and follow-up job cards glow
                    red for today and yellow for tomorrow.
                  </p>
                </div>
                <Switch
                  checked={followUpGlowEnabled}
                  onCheckedChange={handleFollowUpGlowToggle}
                  className="ml-6 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>

              <div className="flex items-center justify-between gap-4 p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Count only non-AMC follow-ups
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    The Followup card counts jobs due within the next 2 days. This device setting
                    additionally excludes AMC jobs from that count.
                  </p>
                </div>
                <Switch
                  checked={followUpDisplaySettings.countOnlyNonAmcFollowUps}
                  onCheckedChange={(enabled) =>
                    updateFollowUpDisplaySettings(
                      { countOnlyNonAmcFollowUps: enabled },
                      enabled
                        ? 'Followup count now excludes AMC jobs'
                        : 'Followup count now includes AMC jobs'
                    )
                  }
                  aria-label="Count only non-AMC follow-ups"
                  className="ml-2 sm:ml-6 shrink-0 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>

              {!isManager ? (
              <div className="flex items-center justify-between p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Compress PDFs
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    Uses highest-quality iLovePDF compression for document downloads, email,
                    WhatsApp, and Require Accept (quotations, bills, invoices, AMC, warranty,
                    salary slips, and more). If credits run out or compression fails, the
                    original PDF is used automatically.
                  </p>
                </div>
                <Switch
                  checked={pdfCompressionEnabled}
                  disabled={pdfCompressionSaving}
                  onCheckedChange={(v) => void handlePdfCompressionToggle(v)}
                  className="ml-6 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>
              ) : null}

              {!isManager ? (
              <div className="flex items-center justify-between p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Job assign / unassign WhatsApp
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    Same setting as WhatsApp Settings (phone and laptop). OFF = no WhatsApp popup
                    when assigning or unassigning. ON = show manual wa.me dialog (or auto-send if
                    enabled in WhatsApp Settings).
                  </p>
                </div>
                <Switch
                  checked={jobWaNotifyPrefs.enabled}
                  disabled={jobWaNotifySaving}
                  onCheckedChange={(v) => void handleJobWaMasterToggle(v)}
                  className="ml-6 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>
              ) : null}
            </CardContent>
          </Card>

          {!isManager ? <EmailTrackingSettings /> : null}

          {!isManager ? <BookingIntentArchiveSettings /> : null}

{!isManager ? (
          <Card id="section-data-export" className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Download className="w-5 h-5" />
                    Data Export
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Download all table data as CSV files for backup or analysis
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleDownloadAllData}
                  disabled={isDownloading}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isDownloading
                    ? downloadProgress
                      ? `Exporting ${downloadProgress}`
                      : 'Downloading...'
                    : 'Download All Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-200 mb-2">
                  <strong>What will be downloaded:</strong>
                </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside columns-1 sm:columns-2">
                    {(exportTableCatalog.length > 0
                      ? exportTableCatalog
                      : [{ name: '_loading', label: 'Loading live table list…' }]
                    ).map((t) => (
                      <li key={t.name}>{t.label}</li>
                    ))}
                  </ul>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
                  One click downloads every public table as CSV in a ZIP (currently{' '}
                  {exportTableCatalog.length || '…'} tables). New tables are included automatically.
                  Empty tables still get a file. App secret values are redacted. Technician passwords
                  live in Supabase Auth (not exported).
                </p>
              </div>
            </CardContent>
          </Card>
) : null}

          {!isManager ? (
          <SettingsActionCard
            title="Storage"
            description="Postgres, Cloudflare R2, and Cloudinary account usage"
            icon={<Database />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('db-storage')}
              >
                <Database className="w-4 h-4 shrink-0" />
                View storage
              </Button>
            }
          />
          ) : null}

          {!isManager ? (
          <SettingsActionCard
            title="AI usage & models"
            description="CRM AI request/token limits and manual Gemini or Groq model selection"
            icon={<Sparkles />}
            actions={
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
                onClick={() => openSettingsPanel('ai-usage')}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                Open AI usage
              </Button>
            }
          />
          ) : null}
                </div>
      </div>

      <MergeCustomersDialog
        open={mergeCustomersOpen}
        onOpenChange={bindSettingsPanelDismiss('merge-customers', () => setMergeCustomersOpen(false))}
        disabled={isManager}
        disabledTitle={managerRestrictedTitle}
      />

      <WarrantyManagementDialog
        open={warrantyDialogOpen}
        onOpenChange={bindSettingsPanelDismiss('warranty', () => setWarrantyDialogOpen(false))}
      />

      <DirectSaleDialog
        open={directSaleOpen}
        onOpenChange={bindSettingsPanelDismiss('direct-sale', () => setDirectSaleOpen(false))}
      />

      {/* Add/Edit Technician Dialog */}
      <Dialog open={addTechnicianDialogOpen || editTechnicianDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianDialogOpen(false);
          setEditTechnicianDialogOpen(false);
          const panel = parseSettingsUrl(location.search).panel;
          if (panel === 'add-technician' || panel === 'edit-technician') {
            onSettingsPanelOpenChange(panel, false);
          }
          setSelectedTechnician(null);
          setNewlyCreatedTechnicianId(null);
        }
      }}>
        <DialogContent
          className="w-full sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg"
          onOpenAutoFocus={(e) => {
            if (editTechnicianDialogOpen) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {editTechnicianDialogOpen ? 'Edit Technician' : 'Add New Technician'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editTechnicianDialogOpen 
                ? 'Update technician information and credentials'
                : 'Create a new technician account with login credentials'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={technicianFormData.fullName}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <Input
                    id="employeeId"
                    value={technicianFormData.employeeId}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                    placeholder="Auto-generated"
                    className="bg-muted/40"
                    readOnly={!editTechnicianDialogOpen}
                  />
                  {!editTechnicianDialogOpen && (
                    <p className="text-xs text-muted-foreground mt-1">Employee ID is auto-generated</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Company calling number *</Label>
                  <Input
                    id="phone"
                    value={technicianFormData.phone}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Number customers see / call"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Company SIM for this technician. If they call a customer from another line, you both get a push (tap opens the customer).
                  </p>
                </div>
                <div>
                  <Label htmlFor="whatsappPhone">WhatsApp (admin messaging only)</Label>
                  <Input
                    id="whatsappPhone"
                    value={technicianFormData.whatsappPhone}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, whatsappPhone: e.target.value }))}
                    placeholder="Optional — where admin sends WhatsApp to this tech"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Used only when admin opens WhatsApp to this technician. Customers always get the contact phone.
                  </p>
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={technicianFormData.email}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <Label htmlFor="password">
                    Password {editTechnicianDialogOpen ? '(leave blank to keep current)' : '*'}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={technicianFormData.password}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editTechnicianDialogOpen ? "Enter new password (optional)" : "Enter password"}
                  />
                </div>
                <div>
                  <Label htmlFor="baseSalary">Basic Salary (INR) *</Label>
                  <Input
                    id="baseSalary"
                    type="number"
                    min="0"
                    step="100"
                    value={technicianFormData.baseSalary || ''}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, baseSalary: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter basic salary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Monthly basic salary for this technician</p>
                </div>
                <div>
                  <Label htmlFor="salaryEffectiveFromMonth">Salary Effective From</Label>
                  <Input
                    id="salaryEffectiveFromMonth"
                    type="month"
                    value={technicianFormData.salaryEffectiveFromMonth}
                    onChange={(e) =>
                      setTechnicianFormData(prev => ({
                        ...prev,
                        salaryEffectiveFromMonth: e.target.value || getCurrentMonthKey()
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If basic salary changes, old months keep the old amount.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 sm:col-span-2">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="salarySlipAutoSend" className="text-sm font-medium">
                      Auto-send salary slip (WhatsApp)
                    </Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Include this technician when WhatsApp Settings → Auto-send salary slip is ON.
                      Last calendar day ~9:00 PM IST, salary-slip PDF for that full month.
                    </p>
                  </div>
                  <Switch
                    id="salarySlipAutoSend"
                    checked={technicianFormData.salarySlipAutoSend === true}
                    onCheckedChange={(checked) =>
                      setTechnicianFormData((prev) => ({
                        ...prev,
                        salarySlipAutoSend: checked,
                      }))
                    }
                  />
                </div>
              </div>
              {editTechnicianDialogOpen && (
                <div className="rounded-lg border border-border bg-muted/40/80 p-3 sm:p-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="accountStatus">Account status</Label>
                    <Select
                      value={technicianFormData.accountStatus}
                      onValueChange={(v) =>
                        setTechnicianFormData((prev) => ({
                          ...prev,
                          accountStatus: v as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
                        }))
                      }
                    >
                      <SelectTrigger id="accountStatus" className="bg-card">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active — roster, payments & salary lists, can log in</SelectItem>
                        <SelectItem value="INACTIVE">Inactive — hidden from roster, maps, and salary/payment screens</SelectItem>
                        <SelectItem value="SUSPENDED">Suspended — cannot log in; adjust in roster filters as needed</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Inactive keeps all job and payment history; change back to Active to show them in Technician Payments again.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor="pushNotificationsEnabled" className="text-sm font-medium">
                        Push notifications
                      </Label>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Master switch for this technician. Turn off to mute all FCM alerts.
                      </p>
                    </div>
                    <Switch
                      id="pushNotificationsEnabled"
                      checked={technicianFormData.pushNotificationsEnabled}
                      onCheckedChange={(checked) =>
                        setTechnicianFormData((prev) => ({
                          ...prev,
                          pushNotificationsEnabled: checked,
                        }))
                      }
                    />
                  </div>
                  {technicianFormData.pushNotificationsEnabled ? (
                    <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
                      <p className="text-sm font-medium">App push types (FCM) for this technician</p>
                      <p className="text-xs text-muted-foreground leading-snug mb-2">
                        Android APK alerts only — not WhatsApp. Global Settings and Device Tracker can
                        still block a type.
                      </p>
                      {TECH_PUSH_CATEGORIES.map((key) => {
                        const meta = TECH_PUSH_LABELS[key];
                        return (
                          <div
                            key={key}
                            className="flex items-start justify-between gap-3 border-b border-border/50 py-2 last:border-0 last:pb-0"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{meta.label}</p>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {meta.description}
                              </p>
                            </div>
                            <Switch
                              checked={technicianFormData.pushPrefs?.[key] !== false}
                              onCheckedChange={(checked) =>
                                setTechnicianFormData((prev) => ({
                                  ...prev,
                                  pushPrefs: {
                                    ...normalizeTechPushPrefs(prev.pushPrefs),
                                    [key]: checked,
                                  },
                                }))
                              }
                              aria-label={meta.label}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="space-y-2 rounded-md border border-emerald-200/80 bg-emerald-50/30 px-3 py-2.5 dark:bg-emerald-950/20">
                    <p className="text-sm font-medium">WhatsApp for this technician</p>
                    <p className="text-xs text-muted-foreground leading-snug mb-2">
                      Same categories as push alerts, plus customer tech-share. Global: Settings →
                      WhatsApp. Assign master: Dashboard Settings.
                    </p>
                    {TECH_WHATSAPP_CATEGORIES.map((key) => {
                      const meta = TECH_WHATSAPP_LABELS[key];
                      return (
                        <div
                          key={key}
                          className="flex items-start justify-between gap-3 border-b border-border/50 py-2 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{meta.label}</p>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              {meta.description}
                            </p>
                          </div>
                          <Switch
                            checked={technicianFormData.whatsappPrefs?.[key] !== false}
                            onCheckedChange={(checked) =>
                              setTechnicianFormData((prev) => ({
                                ...prev,
                                whatsappPrefs: {
                                  ...normalizeTechWhatsAppPrefs(prev.whatsappPrefs),
                                  [key]: checked,
                                },
                              }))
                            }
                            aria-label={meta.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Technician Photo</h3>
              <div>
                <Label className="text-sm sm:text-base">Upload Technician Photo (Optional)</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Upload photo for ID card display</p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianFormData(prev => ({ ...prev, photo: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-photos"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianFormData.photo && (
                  <div className="mt-2">
                    <img 
                      src={technicianFormData.photo} 
                      alt="Technician Photo" 
                      className="w-32 h-32 object-cover border border-border rounded-full"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Payment QR Code</h3>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="tech-dynamic-upi-toggle" className="text-sm font-medium">
                    Dynamic UPI QR
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When on, job-complete builds a live QR with the bill amount from this UPI ID.
                  </p>
                </div>
                <Switch
                  id="tech-dynamic-upi-toggle"
                  checked={technicianFormData.dynamicUpiEnabled}
                  onCheckedChange={(checked) =>
                    setTechnicianFormData((prev) => ({ ...prev, dynamicUpiEnabled: checked }))
                  }
                />
              </div>

              {technicianFormData.dynamicUpiEnabled && (
                <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                  <div>
                    <Label htmlFor="techQrUpiId">UPI ID *</Label>
                    <Input
                      id="techQrUpiId"
                      value={technicianFormData.upiId}
                      onChange={(e) =>
                        setTechnicianFormData((prev) => ({ ...prev, upiId: e.target.value }))
                      }
                      placeholder="name@oksbi"
                      className="mt-1"
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="techQrPayeeName">Payee name (optional)</Label>
                    <Input
                      id="techQrPayeeName"
                      value={technicianFormData.payeeName}
                      onChange={(e) =>
                        setTechnicianFormData((prev) => ({ ...prev, payeeName: e.target.value }))
                      }
                      placeholder="Defaults to technician name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="techQrUpiPhone">Payment phone (optional)</Label>
                    <Input
                      id="techQrUpiPhone"
                      value={technicianFormData.upiPhone}
                      onChange={(e) =>
                        setTechnicianFormData((prev) => ({ ...prev, upiPhone: e.target.value }))
                      }
                      placeholder="10-digit number for pay links"
                      className="mt-1"
                      inputMode="tel"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Shown on the customer pay page / WhatsApp share — separate from contact phone.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm sm:text-base">
                  Upload Payment QR Code
                  {technicianFormData.dynamicUpiEnabled ? ' (optional fallback)' : ' (Optional)'}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                  {technicianFormData.dynamicUpiEnabled
                    ? 'Optional static image if dynamic UPI is off later, or as a backup'
                    : 'Upload QR code for payment scanning'}
                </p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianFormData(prev => ({ ...prev, qrCode: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianFormData.qrCode && (
                  <div className="mt-2">
                    <img 
                      src={technicianFormData.qrCode} 
                      alt="QR Code" 
                      className="w-32 h-32 object-contain border border-border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* QR Code Visibility Settings */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">QR Code Visibility</h3>
              <div>
                <Label className="text-sm sm:text-base">Select which QR codes this technician can see</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3">Control which payment QR codes are available to this technician</p>
                
                <div className="space-y-2 sm:space-y-3">
                  {/* Show All Option */}
                  <div className="flex items-center space-x-2 p-2 sm:p-3 border rounded-lg">
                    <Checkbox
                      id="qr-all"
                      checked={technicianFormData.visibleQrCodes.includes('all')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTechnicianFormData(prev => ({ ...prev, visibleQrCodes: ['all'] }));
                        } else {
                          setTechnicianFormData(prev => ({ ...prev, visibleQrCodes: [] }));
                        }
                      }}
                    />
                    <Label htmlFor="qr-all" className="font-medium cursor-pointer flex-1 text-sm sm:text-base">
                      Show All QR Codes
                    </Label>
                  </div>
                  
                  {/* Common QR Codes */}
                  {commonQrCodes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-medium text-foreground/90">Common QR Codes:</Label>
                      {commonQrCodes.map((qr) => {
                        const qrId = `common_${qr.id}`;
                        const isChecked = technicianFormData.visibleQrCodes.includes(qrId);
                        const isAllSelected = technicianFormData.visibleQrCodes.includes('all');
                        
                        return (
                          <div key={qr.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                            <Checkbox
                              id={qrId}
                              checked={isChecked || isAllSelected}
                              disabled={isAllSelected}
                              onCheckedChange={(checked) => {
                                if (isAllSelected) return;
                                
                                if (checked) {
                                  setTechnicianFormData(prev => ({
                                    ...prev,
                                    visibleQrCodes: [...prev.visibleQrCodes.filter(id => id !== 'all'), qrId]
                                  }));
                                } else {
                                  setTechnicianFormData(prev => ({
                                    ...prev,
                                    visibleQrCodes: prev.visibleQrCodes.filter(id => id !== qrId)
                                  }));
                                }
                              }}
                            />
                            <Label htmlFor={qrId} className="cursor-pointer flex-1 text-xs sm:text-sm">
                              {qr.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Technician QR Codes */}
                  {technicians.filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '').length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-medium text-foreground/90">Technician QR Codes:</Label>
                      {technicians
                        .filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '')
                        .map((tech) => {
                          const qrId = `technician_${tech.id}`;
                          const isChecked = technicianFormData.visibleQrCodes.includes(qrId);
                          const isAllSelected = technicianFormData.visibleQrCodes.includes('all');
                          
                          return (
                            <div key={tech.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                              <Checkbox
                                id={qrId}
                                checked={isChecked || isAllSelected}
                                disabled={isAllSelected}
                                onCheckedChange={(checked) => {
                                  if (isAllSelected) return;
                                  
                                  if (checked) {
                                    setTechnicianFormData(prev => ({
                                      ...prev,
                                      visibleQrCodes: [...prev.visibleQrCodes.filter(id => id !== 'all'), qrId]
                                    }));
                                  } else {
                                    setTechnicianFormData(prev => ({
                                      ...prev,
                                      visibleQrCodes: prev.visibleQrCodes.filter(id => id !== qrId)
                                    }));
                                  }
                                }}
                              />
                              <Label htmlFor={qrId} className="cursor-pointer flex-1 text-xs sm:text-sm">
                                {tech.fullName}'s QR Code
                              </Label>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  
                  {commonQrCodes.length === 0 && technicians.filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '').length === 0 && (
                    <p className="text-xs sm:text-sm text-muted-foreground italic">No QR codes available. Add common QR codes or upload QR codes for technicians.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Common QR (non-payment) - multiple allowed, shown below payment QR */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Common QR</h3>
              <div>
                <Label className="text-sm sm:text-base">Common QRs to show to this technician</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Select one or more. They are shown below the payment QR on the technician app. Add options in the &quot;Common QR&quot; card above.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {technicianCommonQrCodes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No Common QRs added yet. Add some in the Common QR card above.</p>
                  ) : (
                    technicianCommonQrCodes.map((qr) => {
                      const isChecked = technicianFormData.commonQrCodeIds.includes(qr.id);
                      return (
                        <div key={qr.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                          <Checkbox
                            id={`common-qr-${qr.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setTechnicianFormData(prev => ({
                                ...prev,
                                commonQrCodeIds: checked
                                  ? [...prev.commonQrCodeIds, qr.id]
                                  : prev.commonQrCodeIds.filter(id => id !== qr.id)
                              }));
                            }}
                          />
                          <Label htmlFor={`common-qr-${qr.id}`} className="cursor-pointer flex-1 text-sm">
                            {qr.name}
                          </Label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            
            {/* Show ID Card Link after creation */}
            {newlyCreatedTechnicianId && (
              <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-2">
                      Technician Created Successfully!
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      Copy the Hydrogen RO or Eleven RO ID card link below and use any QR code generator to create a QR code for this technician.
                    </p>
                    <TechnicianIdCardLinks technicianId={newlyCreatedTechnicianId} showOpen />
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                      💡 Tip: Visit <a href="https://www.qr-code-generator.com" target="_blank" rel="noopener noreferrer" className="underline">qr-code-generator.com</a> or any QR generator, paste this link, and download the QR code image.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {editTechnicianDialogOpen && selectedTechnician && !isManager ? (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Delete technician</h3>
                <p className="text-xs text-red-800/90 dark:text-red-300/90 mt-1">
                  Permanently remove {selectedTechnician.fullName} ({selectedTechnician.employeeId}).
                  Jobs and customers are kept; assignments are cleared.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleStartDeleteTechnician(selectedTechnician)}
                className="w-full sm:w-auto text-red-600 border-red-300 hover:bg-red-100 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete technician…
              </Button>
            </div>
          ) : null}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setSelectedTechnician(null);
                setNewlyCreatedTechnicianId(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnician}
              disabled={
                isManager ||
                !technicianFormData.fullName ||
                !technicianFormData.phone ||
                !technicianFormData.email ||
                !technicianFormData.employeeId ||
                (!editTechnicianDialogOpen && !technicianFormData.password) ||
                technicianFormData.baseSalary < 0
              }
              title={isManager ? managerRestrictedTitle : undefined}
              className=" w-full sm:w-auto"
            >
              {isManager
                ? 'Restricted'
                : editTechnicianDialogOpen
                  ? 'Update Technician'
                  : 'Create Technician'}
            </Button>
            {newlyCreatedTechnicianId && (
              <Button
                variant="outline"
                onClick={() => {
                  closeSettingsPanel();
                  setSelectedTechnician(null);
                  setNewlyCreatedTechnicianId(null);
                }}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Common QR Code Dialog */}
      <Dialog open={addQrCodeDialogOpen || editQrCodeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddQrCodeDialogOpen(false);
          setEditQrCodeDialogOpen(false);
          const panel = parseSettingsUrl(location.search).panel;
          if (panel === 'add-payment-qr' || panel === 'edit-payment-qr') {
            onSettingsPanelOpenChange(panel, false);
          }
          setSelectedQrCode(null);
          setQrCodeFormData({
            name: '',
            qrCodeUrl: '',
            upiId: '',
            payeeName: '',
            phone: '',
            dynamicUpiEnabled: false,
          });
          setQrCodeUploading(false);
        }
      }}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg pr-6">
              {editQrCodeDialogOpen ? 'Edit QR Code' : 'Add New QR Code'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editQrCodeDialogOpen 
                ? 'Update QR code information'
                : 'Create a new common QR code for payment scanning'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="qrCodeName">QR Code Name *</Label>
                <Input
                  id="qrCodeName"
                  value={qrCodeFormData.name}
                  onChange={(e) => {
                    setQrCodeFormData(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="e.g., Company UPI QR, Main Account QR"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="dynamic-upi-toggle" className="text-sm font-medium">
                    Dynamic UPI QR
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When on, technician job-complete builds a live QR with the bill amount.
                  </p>
                </div>
                <Switch
                  id="dynamic-upi-toggle"
                  checked={qrCodeFormData.dynamicUpiEnabled}
                  onCheckedChange={(checked) =>
                    setQrCodeFormData((prev) => ({ ...prev, dynamicUpiEnabled: checked }))
                  }
                />
              </div>

              {qrCodeFormData.dynamicUpiEnabled && (
                <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                  <div>
                    <Label htmlFor="qrUpiId">UPI ID *</Label>
                    <Input
                      id="qrUpiId"
                      value={qrCodeFormData.upiId}
                      onChange={(e) =>
                        setQrCodeFormData((prev) => ({ ...prev, upiId: e.target.value }))
                      }
                      placeholder="business@oksbi"
                      className="mt-1"
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="qrPayeeName">Payee name (optional)</Label>
                    <Input
                      id="qrPayeeName"
                      value={qrCodeFormData.payeeName}
                      onChange={(e) =>
                        setQrCodeFormData((prev) => ({ ...prev, payeeName: e.target.value }))
                      }
                      placeholder="Defaults to QR name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="qrPayPhone">Payment phone (optional)</Label>
                    <Input
                      id="qrPayPhone"
                      value={qrCodeFormData.phone}
                      onChange={(e) =>
                        setQrCodeFormData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="10-digit number for pay links"
                      className="mt-1"
                      inputMode="tel"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Shown on the customer pay page and in WhatsApp share text.
                    </p>
                  </div>
                </div>
              )}
              
              <div>
                <Label>
                  Upload QR Code Image
                  {qrCodeFormData.dynamicUpiEnabled ? ' (optional fallback)' : ' *'}
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  {qrCodeFormData.dynamicUpiEnabled
                    ? 'Optional static image if dynamic UPI is off later, or as a backup'
                    : 'Upload QR code image for payment scanning'}
                </p>
                <ImageUpload
                  key={selectedQrCode?.id ?? (addQrCodeDialogOpen ? 'new-payment-qr' : 'closed-payment-qr')}
                  onImagesChange={(images) => {
                    setQrCodeFormData((prev) => ({ ...prev, qrCodeUrl: images[0] || '' }));
                  }}
                  onUploadStateChange={setQrCodeUploading}
                  initialImages={qrCodeFormData.qrCodeUrl ? [qrCodeFormData.qrCodeUrl] : []}
                  maxImages={1}
                  folder="common-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                  compact
                  skipOfflineQueue
                />
                {!qrCodeFormData.qrCodeUrl && !qrCodeUploading && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {qrCodeFormData.dynamicUpiEnabled
                      ? 'No fallback image (dynamic UPI will be used)'
                      : 'No QR code uploaded yet'}
                  </p>
                )}
                {qrCodeUploading && (
                  <p className="text-xs text-muted-foreground mt-1">Uploading image…</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setSelectedQrCode(null);
                setQrCodeFormData({
                  name: '',
                  qrCodeUrl: '',
                  upiId: '',
                  payeeName: '',
                  phone: '',
                  dynamicUpiEnabled: false,
                });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleSaveQrCode();
              }}
              disabled={
                !qrCodeFormData.name ||
                qrCodeUploading ||
                (qrCodeFormData.dynamicUpiEnabled
                  ? !qrCodeFormData.upiId.trim()
                  : !qrCodeFormData.qrCodeUrl)
              }
              className=" w-full sm:w-auto"
            >
              {editQrCodeDialogOpen ? 'Update QR Code' : 'Create QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Common QR (non-payment) Dialog */}
      <Dialog open={addTechnicianCommonQrDialogOpen || editTechnicianCommonQrDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianCommonQrDialogOpen(false);
          setEditTechnicianCommonQrDialogOpen(false);
          const panel = parseSettingsUrl(location.search).panel;
          if (panel === 'add-tech-qr' || panel === 'edit-tech-qr') {
            onSettingsPanelOpenChange(panel, false);
          }
          setSelectedTechnicianCommonQr(null);
          setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
          setTechnicianCommonQrUploading(false);
        }
      }}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg pr-6">
              {editTechnicianCommonQrDialogOpen ? 'Edit Common QR' : 'Add Common QR'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editTechnicianCommonQrDialogOpen ? 'Update this Common QR' : 'Create a QR shown to technicians below the payment QR. Assign it in Technician Management.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="technicianCommonQrName">Name *</Label>
                <Input
                  id="technicianCommonQrName"
                  value={technicianCommonQrFormData.name}
                  onChange={(e) => setTechnicianCommonQrFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Support QR, Feedback QR"
                />
              </div>
              <div>
                <Label>Upload QR Code Image *</Label>
                <p className="text-sm text-muted-foreground mb-2">Upload the QR image (non-payment)</p>
                <ImageUpload
                  key={selectedTechnicianCommonQr?.id ?? (addTechnicianCommonQrDialogOpen ? 'new-common-qr' : 'closed-common-qr')}
                  onImagesChange={(images) =>
                    setTechnicianCommonQrFormData((prev) => ({ ...prev, qrCodeUrl: images[0] || '' }))
                  }
                  onUploadStateChange={setTechnicianCommonQrUploading}
                  initialImages={
                    technicianCommonQrFormData.qrCodeUrl ? [technicianCommonQrFormData.qrCodeUrl] : []
                  }
                  maxImages={1}
                  folder="technician-common-qr"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                  compact
                  skipOfflineQueue
                />
                {technicianCommonQrUploading && (
                  <p className="text-xs text-muted-foreground mt-1">Uploading image…</p>
                )}
                {!technicianCommonQrFormData.qrCodeUrl && !technicianCommonQrUploading && (
                  <p className="text-xs text-muted-foreground mt-1">No QR image uploaded yet</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setSelectedTechnicianCommonQr(null);
                setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnicianCommonQr}
              disabled={
                !technicianCommonQrFormData.name?.trim() ||
                !technicianCommonQrFormData.qrCodeUrl?.trim() ||
                technicianCommonQrUploading
              }
              className=" w-full sm:w-auto"
            >
              {editTechnicianCommonQrDialogOpen ? 'Update Common QR' : 'Create Common QR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product QR Code Dialog */}
      <Dialog open={addProductQrCodeDialogOpen || editProductQrCodeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddProductQrCodeDialogOpen(false);
          setEditProductQrCodeDialogOpen(false);
          const panel = parseSettingsUrl(location.search).panel;
          if (panel === 'add-product-qr' || panel === 'edit-product-qr') {
            onSettingsPanelOpenChange(panel, false);
          }
          setSelectedProductQrCode(null);
          setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editProductQrCodeDialogOpen ? 'Edit Product QR Code' : 'Add New Product QR Code'}
            </DialogTitle>
            <DialogDescription>
              {editProductQrCodeDialogOpen 
                ? 'Update product QR code information'
                : 'Create a new QR code for product verification. When scanned, it will show "Genuine Product"'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="productQrCodeName">Product Identifier/Name *</Label>
                <Input
                  id="productQrCodeName"
                  value={productQrCodeFormData.name}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="e.g., Product Model XYZ, Batch 2024"
                />
                <p className="text-xs text-muted-foreground mt-1">This will be displayed on the verification page</p>
              </div>

              <div>
                <Label htmlFor="productName">Product Name (Optional)</Label>
                <Input
                  id="productName"
                  value={productQrCodeFormData.productName}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productName: e.target.value }));
                  }}
                  placeholder="e.g., RO Filter Cartridge"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show product name</p>
              </div>

              <div>
                <Label htmlFor="productDescription">Product Description (Optional)</Label>
                <textarea
                  id="productDescription"
                  value={productQrCodeFormData.productDescription}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productDescription: e.target.value }));
                  }}
                  placeholder="Additional product information..."
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show description</p>
              </div>

              <div>
                <Label htmlFor="productMrp">MRP - Maximum Retail Price (Optional)</Label>
                <Input
                  id="productMrp"
                  value={productQrCodeFormData.productMrp}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productMrp: e.target.value }));
                  }}
                  placeholder="e.g., ₹1,299 or ₹1,299.00"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show MRP</p>
              </div>
              
              <div>
                <Label>Product Photo (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Upload a product photo. If not uploaded, product photo won't be displayed on the verification page.
                </p>
                <ImageUpload
                  onImagesChange={(images) => {
                    const url = images[0] || '';
                    setProductQrCodeFormData(prev => ({ ...prev, productImageUrl: url }));
                  }}
                  maxImages={1}
                  folder="product-images"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {productQrCodeFormData.productImageUrl && (
                  <div className="mt-2">
                    <img 
                      src={productQrCodeFormData.productImageUrl} 
                      alt="Product" 
                      className="w-32 h-32 object-cover border border-border rounded"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Product photo uploaded</p>
                  </div>
                )}
                {!productQrCodeFormData.productImageUrl && (
                  <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
                    <p className="text-xs text-muted-foreground">
                      No product photo uploaded. Product photo won't be displayed on verification page.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-primary/10 rounded border border-primary/20">
                <p className="text-xs text-primary font-medium mb-1">
                  ℹ️ QR Code Information
                </p>
                <p className="text-xs text-muted-foreground">
                  QR code will be generated automatically from the verification link when you save. No need to upload QR code image.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setSelectedProductQrCode(null);
                setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProductQrCode}
              disabled={!productQrCodeFormData.name}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {editProductQrCodeDialogOpen ? 'Update Product QR Code' : 'Create Product QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Todo Dialog */}
      <Dialog open={addTodoDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTodoDialogOpen(false);
          onSettingsPanelOpenChange('add-todo', false);
          setNewTodoText('');
        }
      }}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Enter a new task to add to your todo list
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="todoText">Task</Label>
              <Input
                id="todoText"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Enter task description"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTodoText.trim()) {
                    handleSaveTodo();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setNewTodoText('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTodo}
              disabled={!newTodoText || !newTodoText.trim()}
              className=" w-full sm:w-auto"
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Todo Confirmation Dialog */}
      <AlertDialog open={todoToDelete !== null} onOpenChange={(open) => {
        if (!open) {
          setTodoToDelete(null);
        }
      }}>
        <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left sm:text-center">
            <AlertDialogTitle className="text-base sm:text-lg font-semibold">
              Complete Task
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-muted-foreground mt-2">
              Are you sure you want to complete this task? It will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4 sm:mt-0">
            <AlertDialogCancel 
              onClick={() => setTodoToDelete(null)}
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm sm:text-sm font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (todoToDelete) {
                  handleDeleteTodo(todoToDelete);
                }
              }}
              className=" w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm sm:text-sm font-medium"
            >
              Complete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Amount Tracker Dialog */}
      <Dialog
        open={addTrackerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddTrackerDialogOpen(false);
            onSettingsPanelOpenChange('add-tracker', false);
            setNewTrackerName('');
            setNewTrackerAmount('');
          }
        }}
      >
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>New Amount Tracker</DialogTitle>
            <DialogDescription>
              Give it a name (e.g. Cash flow) and a starting amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="trackerName">Name</Label>
              <Input
                id="trackerName"
                value={newTrackerName}
                onChange={(e) => setNewTrackerName(e.target.value)}
                placeholder="e.g. Cash flow"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTrackerName.trim()) {
                    handleSaveTracker();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="trackerAmount">Starting amount (₹)</Label>
              <Input
                id="trackerAmount"
                type="text"
                inputMode="decimal"
                value={newTrackerAmount}
                onChange={(e) => setNewTrackerAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 1000"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                closeSettingsPanel();
                setNewTrackerName('');
                setNewTrackerAmount('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTracker}
              disabled={!newTrackerName.trim()}
              className=" w-full sm:w-auto"
            >
              Create Tracker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Amount Tracker Confirmation */}
      <AlertDialog
        open={trackerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTrackerToDelete(null);
        }}
      >
        <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left sm:text-center">
            <AlertDialogTitle className="text-base sm:text-lg font-semibold">
              Delete Tracker
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-muted-foreground mt-2">
              Delete this tracker permanently? The current total will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4 sm:mt-0">
            <AlertDialogCancel
              onClick={() => setTrackerToDelete(null)}
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trackerToDelete) handleDeleteTracker(trackerToDelete);
              }}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm font-medium"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete technician — 2-step confirmation */}
      <AlertDialog
        open={deleteTechnicianStep === 1}
        onOpenChange={(open) => {
          if (!open) resetDeleteTechnicianFlow();
        }}
      >
        <AlertDialogContent className="mx-4 sm:mx-0 max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete technician? (Step 1 of 2)</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  You are about to permanently delete{' '}
                  <strong className="text-foreground">{technicianToDelete?.fullName}</strong> (
                  {technicianToDelete?.employeeId}). This cannot be undone.
                </p>
                <p>The following will be removed:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Profile, login, ID card link, salary and inventory records</li>
                  <li>Assignment requests, parts used, and messages to this technician</li>
                </ul>
                <p>
                  <strong className="text-foreground">Jobs and customers are not deleted.</strong> Job
                  assignments will be cleared.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                setDeleteTechnicianStep(2);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTechnicianStep === 2}
        onOpenChange={(open) => {
          if (!open) resetDeleteTechnicianFlow();
        }}
      >
        <AlertDialogContent className="mx-4 sm:mx-0 max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm deletion (Step 2 of 2)</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete{' '}
              <strong>{technicianToDelete?.fullName}</strong> and all related data? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0" disabled={isDeletingTechnician}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingTechnician}
              onClick={(e) => {
                e.preventDefault();
                void handleExecuteDeleteTechnician();
              }}
            >
              {isDeletingTechnician ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Section at Bottom */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="border-red-200">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-foreground mb-1">Logout</h3>
                <p className="text-sm text-muted-foreground">Sign out of your account</p>
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  await logout();
                  navigate('/admin', { replace: true });
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300 w-full sm:w-auto"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;