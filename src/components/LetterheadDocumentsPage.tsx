import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  ClipboardCheck,
  FileSignature,
  Stamp,
  Printer,
  Save,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  FileDown,
  TableProperties,
  Type as TypeIcon,
  SeparatorHorizontal,
  Eye,
  Search,
  UserCheck,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

import RichTextEditor from '@/components/letterhead/RichTextEditor';
import TableBlockEditor from '@/components/letterhead/TableBlockEditor';
import {
  LETTERHEAD_DOCUMENT_TYPE_LABEL,
  LetterheadBlock,
  LetterheadDocumentData,
  LetterheadDocumentType,
  buildDefaultLetterheadNumber,
  buildLetterheadInnerHtml,
  createEmptyLetterhead,
  createStarterBlocks,
  generateLetterheadPDF,
  getLetterheadBodyClass,
  getLetterheadCss,
  newBlockId,
  normalizeLetterheadData,
} from '@/lib/letterhead-pdf-generator';
import {
  DocumentBrand,
  getDocumentBrandLabel,
} from '@/lib/service-brands';

interface LetterheadDocumentsPageProps {
  onBack?: () => void;
  /** Optional document type pre-selected via the deep-link from Settings. */
  initialType?: LetterheadDocumentType;
}

const DOCUMENT_TYPES: LetterheadDocumentType[] = [
  'service_report',
  'amc_report',
  'custom_document',
  'letterhead',
];

/** Visual metadata for each document type — used for the type picker chips
 *  and the badge in the sticky header. Tailwind-only so it stays cohesive
 *  with the rest of the admin UI. */
const TYPE_META: Record<
  LetterheadDocumentType,
  {
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    softBg: string;
    softText: string;
    softBorder: string;
    /** Fully-qualified Tailwind ring class (Tailwind's JIT can't see dynamic strings). */
    ring: string;
  }
> = {
  service_report: {
    icon: ClipboardCheck,
    accent: 'bg-blue-600 hover:bg-blue-700 text-white',
    softBg: 'bg-blue-50',
    softText: 'text-blue-700',
    softBorder: 'border-blue-200',
    ring: 'ring-blue-200',
  },
  amc_report: {
    icon: FileSignature,
    accent: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    softBg: 'bg-emerald-50',
    softText: 'text-emerald-700',
    softBorder: 'border-emerald-200',
    ring: 'ring-emerald-200',
  },
  custom_document: {
    icon: FileText,
    accent: 'bg-violet-600 hover:bg-violet-700 text-white',
    softBg: 'bg-violet-50',
    softText: 'text-violet-700',
    softBorder: 'border-violet-200',
    ring: 'ring-violet-200',
  },
  letterhead: {
    icon: Stamp,
    accent: 'bg-amber-600 hover:bg-amber-700 text-white',
    softBg: 'bg-amber-50',
    softText: 'text-amber-700',
    softBorder: 'border-amber-200',
    ring: 'ring-amber-200',
  },
};

const DRAFT_INDEX_KEY = 'letterhead_drafts_v1';
const ACTIVE_DRAFT_KEY = 'letterhead_active_v1';

interface DraftIndexEntry {
  id: string;
  title: string;
  type: LetterheadDocumentType;
  brand: DocumentBrand;
  updatedAt: string;
}

function readDrafts(): DraftIndexEntry[] {
  try {
    const raw = window.localStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d: any) => d && typeof d.id === 'string' && typeof d.title === 'string'
    );
  } catch {
    return [];
  }
}

function writeDrafts(list: DraftIndexEntry[]) {
  try {
    window.localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(list));
  } catch {
    /* localStorage full or disabled */
  }
}

function readDraftById(id: string): LetterheadDocumentData | null {
  try {
    const raw = window.localStorage.getItem(`letterhead_draft_${id}`);
    if (!raw) return null;
    return normalizeLetterheadData(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeDraftById(id: string, data: LetterheadDocumentData) {
  try {
    window.localStorage.setItem(`letterhead_draft_${id}`, JSON.stringify(data));
  } catch {
    /* localStorage full or disabled */
  }
}

function deleteDraftById(id: string) {
  try {
    window.localStorage.removeItem(`letterhead_draft_${id}`);
  } catch {
    /* ignore */
  }
}

function readActiveDraft(): LetterheadDocumentData | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
    if (!raw) return null;
    return normalizeLetterheadData(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeActiveDraft(data: LetterheadDocumentData | null) {
  try {
    if (!data) {
      window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(data));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Letterhead Documents / Service Reports builder.
 *
 * Features:
 *   - Pick document type (Service Report / AMC Report / Custom / Letterhead).
 *   - Pick brand (Hydrogen RO / Eleven RO). Company info auto-fills via service-brands.
 *   - Edit header fields, body blocks (text + tables + images + page breaks),
 *     signatures, stamp, notes, terms.
 *   - Live preview rendered through the exact same HTML template used for print.
 *   - Auto-saves to localStorage so refreshes don't lose work.
 *   - Save Draft / Load Draft / Delete Draft.
 *   - Print / Save as PDF via the system print dialog.
 */
export default function LetterheadDocumentsPage({
  onBack,
  initialType,
}: LetterheadDocumentsPageProps) {
  const navigate = useNavigate();

  const [data, setData] = useState<LetterheadDocumentData>(() => {
    const restored = readActiveDraft();
    if (restored) return restored;
    return createEmptyLetterhead(initialType || 'service_report');
  });
  const [drafts, setDrafts] = useState<DraftIndexEntry[]>(() => readDrafts());
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // If user just deep-linked to a specific type and there's no active draft yet,
  // honour the requested type once after mount.
  useEffect(() => {
    if (!initialType) return;
    const restored = readActiveDraft();
    if (!restored) {
      setData(createEmptyLetterhead(initialType));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save current document to localStorage on every change.
  useEffect(() => {
    writeActiveDraft(data);
  }, [data]);

  // Render the live preview by writing into the iframe whenever data changes.
  const previewHtml = useMemo(() => {
    const bodyClass = getLetterheadBodyClass(data);
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${getLetterheadCss()}</style></head><body class="${bodyClass}">${buildLetterheadInnerHtml(data)}</body></html>`;
  }, [data]);

  useEffect(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  const updateData = useCallback(
    <K extends keyof LetterheadDocumentData>(key: K, value: LetterheadDocumentData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const switchDocumentType = useCallback((nextType: LetterheadDocumentType) => {
    setData((prev) => ({
      ...prev,
      documentType: nextType,
      title:
        prev.title && prev.title !== LETTERHEAD_DOCUMENT_TYPE_LABEL[prev.documentType]
          ? prev.title
          : LETTERHEAD_DOCUMENT_TYPE_LABEL[nextType],
      documentNumber:
        // Only regenerate the number when the user hasn't touched it manually.
        /^[A-Z-]+\d{4}-\d{4}$/.test(prev.documentNumber)
          ? buildDefaultLetterheadNumber(nextType)
          : prev.documentNumber,
      blocks:
        prev.blocks.length === 0 || allBlocksEmpty(prev.blocks)
          ? createStarterBlocks(nextType)
          : prev.blocks,
    }));
  }, []);

  const switchBrand = useCallback((nextBrand: DocumentBrand) => {
    setData((prev) => ({ ...prev, brand: nextBrand }));
  }, []);

  // --- Block helpers ---
  const updateBlock = (id: string, partial: Partial<LetterheadBlock>) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, ...partial } as LetterheadBlock) : b)),
    }));
  };
  const removeBlock = (id: string) => {
    setData((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  };
  const moveBlock = (id: string, direction: -1 | 1) => {
    setData((prev) => {
      const idx = prev.blocks.findIndex((b) => b.id === id);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= prev.blocks.length) return prev;
      const blocks = prev.blocks.slice();
      const [removed] = blocks.splice(idx, 1);
      blocks.splice(next, 0, removed);
      return { ...prev, blocks };
    });
  };
  const addBlock = (kind: LetterheadBlock['kind']) => {
    setData((prev) => {
      const block: LetterheadBlock =
        kind === 'text'
          ? { id: newBlockId(), kind: 'text', html: '<p></p>' }
          : kind === 'table'
            ? {
                id: newBlockId(),
                kind: 'table',
                title: '',
                columns: ['Column 1', 'Column 2'],
                rows: [
                  ['', ''],
                  ['', ''],
                ],
              }
            : kind === 'image'
              ? { id: newBlockId(), kind: 'image', src: '', widthPercent: 80 }
              : { id: newBlockId(), kind: 'pagebreak' };
      return { ...prev, blocks: [...prev.blocks, block] };
    });
  };

  const onImageBlockUpload = (id: string, file: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Please use an image smaller than 4 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      updateBlock(id, { src: result } as Partial<LetterheadBlock>);
    };
    reader.readAsDataURL(file);
  };

  const onSignatureUpload = (
    side: 'leftSignatory' | 'rightSignatory',
    file: File | null
  ) => {
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast.error('Please use a signature image smaller than 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setData((prev) => ({
        ...prev,
        [side]: { ...(prev[side] || {}), imageUrl: result },
      }));
    };
    reader.readAsDataURL(file);
  };

  const onCustomStampUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast.error('Please use a stamp image smaller than 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setData((prev) => ({ ...prev, customStampUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  // --- Drafts ---
  const handleSaveDraft = () => {
    const id = `${data.documentType}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    writeDraftById(id, data);
    const entry: DraftIndexEntry = {
      id,
      title: data.title || data.documentNumber || 'Untitled',
      type: data.documentType,
      brand: data.brand,
      updatedAt: new Date().toISOString(),
    };
    const next = [entry, ...drafts].slice(0, 25);
    setDrafts(next);
    writeDrafts(next);
    toast.success('Draft saved');
  };

  const handleLoadDraft = (id: string) => {
    const loaded = readDraftById(id);
    if (!loaded) {
      toast.error('Could not load this draft');
      return;
    }
    setData(loaded);
    toast.success('Draft loaded');
  };

  const handleDeleteDraft = (id: string) => {
    deleteDraftById(id);
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    writeDrafts(next);
    toast.success('Draft deleted');
  };

  const handleResetConfirmed = () => {
    setData(createEmptyLetterhead(data.documentType, data.brand));
    writeActiveDraft(null);
    setResetDialogOpen(false);
    toast.success('Document reset');
  };

  const handlePrint = () => {
    generateLetterheadPDF(data, 'print');
  };
  const handleDownload = () => {
    generateLetterheadPDF(data, 'pdf');
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/admin');
  };

  const activeMeta = TYPE_META[data.documentType];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 pb-24 lg:pb-6">
      {/* Sticky header — title on the left, badges + primary actions on the right.
          On mobile we collapse button labels to icons to keep one tidy row. */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 shadow-sm">
        <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 py-2.5 md:py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-slate-600 hover:text-slate-900 -ml-2 shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`hidden xs:inline-flex h-9 w-9 items-center justify-center rounded-lg ${activeMeta.softBg} ${activeMeta.softText}`}
                >
                  <ActiveIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-sm sm:text-base font-semibold text-slate-900">
                    Letterhead Documents
                  </h1>
                  <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                    Service reports, AMC reports & custom documents
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                variant="outline"
                className="hidden md:inline-flex border-slate-300 text-slate-700 bg-white"
              >
                {getDocumentBrandLabel(data.brand)}
              </Badge>
              <Badge
                variant="outline"
                className={`hidden md:inline-flex ${activeMeta.softBg} ${activeMeta.softText} ${activeMeta.softBorder}`}
              >
                {LETTERHEAD_DOCUMENT_TYPE_LABEL[data.documentType]}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMobilePreview((v) => !v)}
                className="lg:hidden"
                aria-label={showMobilePreview ? 'Hide preview' : 'Show preview'}
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                className="hidden sm:inline-flex border-slate-300"
              >
                <Save className="w-4 h-4 mr-1" /> Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="border-slate-300"
                aria-label="Save as PDF"
              >
                <FileDown className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button
                size="sm"
                onClick={handlePrint}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                <Printer className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Sidebar */}
        <aside className="space-y-4 lg:col-span-1">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold text-slate-900">Document Type</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Switch templates anytime — your current content stays.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3">
              {DOCUMENT_TYPES.map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                const active = data.documentType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchDocumentType(t)}
                    className={
                      'group flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition ' +
                      (active
                        ? `${meta.softBg} ${meta.softBorder} ring-2 ring-offset-1 ring-offset-white ${meta.ring} shadow-sm`
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50')
                    }
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-md ${meta.softBg} ${meta.softText}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span
                      className={
                        'text-[12px] font-medium leading-tight ' +
                        (active ? meta.softText : 'text-slate-800')
                      }
                    >
                      {LETTERHEAD_DOCUMENT_TYPE_LABEL[t]}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold text-slate-900">Brand</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Auto-loads logo, address &amp; footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3">
              <button
                type="button"
                onClick={() => switchBrand('hydrogenro')}
                className={
                  'flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 transition ' +
                  (data.brand === 'hydrogenro'
                    ? 'bg-sky-50 border-sky-300 text-sky-700 ring-2 ring-sky-200 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')
                }
              >
                <span className="text-[13px] font-semibold">Hydrogen RO</span>
                <span className="text-[10px] text-slate-500">GST · India</span>
              </button>
              <button
                type="button"
                onClick={() => switchBrand('elevenro')}
                className={
                  'flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 transition ' +
                  (data.brand === 'elevenro'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-200 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')
                }
              >
                <span className="text-[13px] font-semibold">Eleven RO</span>
                <span className="text-[10px] text-slate-500">No GST</span>
              </button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">Drafts</CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Stored on this device.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                title="Reset current document"
                className="h-7 w-7 p-0"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-auto">
              {drafts.length === 0 && (
                <p className="text-xs text-gray-500">
                  No saved drafts yet. Click <strong>Save draft</strong> to keep
                  a version on this device.
                </p>
              )}
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => handleLoadDraft(d.id)}
                    className="flex-1 text-left text-sm font-medium text-gray-900 truncate hover:underline"
                    title={`Load ${d.title}`}
                  >
                    <span className="block truncate">{d.title}</span>
                    <span className="block text-[10px] text-gray-500">
                      {LETTERHEAD_DOCUMENT_TYPE_LABEL[d.type]} ·{' '}
                      {getDocumentBrandLabel(d.brand)} ·{' '}
                      {new Date(d.updatedAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteDraft(d.id)}
                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                    title="Delete draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>

        {/* Builder */}
        <section className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <UserCheck className="w-4 h-4" />
                </span>
                Customer
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Search a saved customer to auto-fill name, site, phone &amp; email.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4">
              <CustomerPicker
                selectedSummary={
                  data.customerId
                    ? buildCustomerSummary(data)
                    : null
                }
                onPick={(picked) => setData((prev) => ({ ...prev, ...picked }))}
                onClear={() =>
                  setData((prev) => ({
                    ...prev,
                    customerId: '',
                    customerCode: '',
                    customerPhone: '',
                    customerEmail: '',
                  }))
                }
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold text-slate-900">Header</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                These fields print under the company letterhead.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="lh-title">Document Title</Label>
                <Input
                  id="lh-title"
                  value={data.title}
                  onChange={(e) => updateData('title', e.target.value)}
                  placeholder="Service Report"
                />
              </div>
              <div>
                <Label htmlFor="lh-doc-no">Document Number</Label>
                <Input
                  id="lh-doc-no"
                  value={data.documentNumber}
                  onChange={(e) => updateData('documentNumber', e.target.value)}
                  placeholder="SR-2026-0001"
                />
              </div>
              <div>
                <Label htmlFor="lh-date">Date</Label>
                <DatePicker
                  value={data.date}
                  onChange={(v) => updateData('date', v || '')}
                />
              </div>
              <div>
                <Label htmlFor="lh-cust-name">Customer Name</Label>
                <Input
                  id="lh-cust-name"
                  value={data.customerName || ''}
                  onChange={(e) => updateData('customerName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lh-cust-company">Customer Company</Label>
                <Input
                  id="lh-cust-company"
                  value={data.customerCompany || ''}
                  onChange={(e) => updateData('customerCompany', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="lh-site">Site Location</Label>
                <Input
                  id="lh-site"
                  value={data.siteLocation || ''}
                  onChange={(e) => updateData('siteLocation', e.target.value)}
                  placeholder="e.g. Plant 2, Bommanahalli, Bengaluru"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="lh-subject">Subject</Label>
                <Input
                  id="lh-subject"
                  value={data.subject || ''}
                  onChange={(e) => updateData('subject', e.target.value)}
                  placeholder="Service Visit – Monthly Maintenance"
                />
              </div>
              <div>
                <Label htmlFor="lh-ref">Reference No.</Label>
                <Input
                  id="lh-ref"
                  value={data.referenceNumber || ''}
                  onChange={(e) => updateData('referenceNumber', e.target.value)}
                  placeholder="WO-1234"
                />
              </div>
              <div>
                <Label htmlFor="lh-cc">CC</Label>
                <Input
                  id="lh-cc"
                  value={data.cc || ''}
                  onChange={(e) => updateData('cc', e.target.value)}
                  placeholder="ops@company.com"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 sm:px-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base font-semibold text-slate-900">Body</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Mix and match text, tables, images and page breaks.
                </CardDescription>
              </div>
              <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-1.5">
                <ToolbarPill onClick={() => addBlock('text')} icon={TypeIcon} label="Text" />
                <ToolbarPill onClick={() => addBlock('table')} icon={TableProperties} label="Table" />
                <ToolbarPill onClick={() => addBlock('image')} icon={ImageIcon} label="Image" />
                <ToolbarPill
                  onClick={() => addBlock('pagebreak')}
                  icon={SeparatorHorizontal}
                  label="Break"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className="rounded-md border border-gray-200 bg-gray-50/40 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[11px]">
                      Block {idx + 1} · {block.kind}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveBlock(block.id, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        className="h-7 w-7 p-0"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveBlock(block.id, 1)}
                        disabled={idx === data.blocks.length - 1}
                        title="Move down"
                        className="h-7 w-7 p-0"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBlock(block.id)}
                        title="Remove block"
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {block.kind === 'text' && (
                    <RichTextEditor
                      value={block.html}
                      onChange={(html) =>
                        updateBlock(block.id, { html } as Partial<LetterheadBlock>)
                      }
                    />
                  )}

                  {block.kind === 'table' && (
                    <TableBlockEditor
                      title={block.title}
                      columns={block.columns}
                      rows={block.rows}
                      onChange={(next) =>
                        updateBlock(block.id, next as Partial<LetterheadBlock>)
                      }
                    />
                  )}

                  {block.kind === 'image' && (
                    <div className="space-y-2">
                      {block.src ? (
                        <div className="rounded border bg-white p-2">
                          <img
                            src={block.src}
                            alt={block.caption || 'Document image'}
                            className="mx-auto max-h-56"
                          />
                        </div>
                      ) : (
                        <div className="rounded border border-dashed bg-white p-6 text-center text-xs text-gray-500">
                          No image selected
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Upload image</Label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              onImageBlockUpload(
                                block.id,
                                e.target.files?.[0] ?? null
                              )
                            }
                            className="block w-full text-xs"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Caption</Label>
                          <Input
                            value={block.caption || ''}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                caption: e.target.value,
                              } as Partial<LetterheadBlock>)
                            }
                            placeholder="Optional caption"
                            className="h-8"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Width %</Label>
                          <Input
                            type="number"
                            min={10}
                            max={100}
                            value={block.widthPercent ?? 80}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                widthPercent: Number(e.target.value) || 80,
                              } as Partial<LetterheadBlock>)
                            }
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {block.kind === 'pagebreak' && (
                    <div className="rounded border border-dashed bg-white px-3 py-2 text-xs text-gray-500">
                      Forces the printer to start a new page after this point.
                    </div>
                  )}
                </div>
              ))}

              {data.blocks.length === 0 && (
                <div className="rounded border border-dashed bg-white py-6 text-center text-sm text-gray-500">
                  No content yet. Add a text block, a table or an image to get
                  started.
                </div>
              )}

              <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 pt-1">
                <ToolbarPill onClick={() => addBlock('text')} icon={Plus} label="Text" />
                <ToolbarPill onClick={() => addBlock('table')} icon={Plus} label="Table" />
                <ToolbarPill onClick={() => addBlock('image')} icon={Plus} label="Image" />
                <ToolbarPill onClick={() => addBlock('pagebreak')} icon={Plus} label="Break" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold text-slate-900">Signatures &amp; Stamp</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Brand seal is auto-attached on the left; you can replace either side.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatorySection
                title="Authorized Signatory (left)"
                hidden={!!data.hideLeftSignatory}
                onHiddenChange={(v) => updateData('hideLeftSignatory', v)}
                hideLabel="Hide authorized signature on this document"
                signatoryName={data.leftSignatory?.name || ''}
                signatoryDesignation={data.leftSignatory?.designation || ''}
                signatoryImage={data.leftSignatory?.imageUrl}
                onChangeName={(name) =>
                  setData((prev) => ({
                    ...prev,
                    leftSignatory: { ...(prev.leftSignatory || {}), name },
                  }))
                }
                onChangeDesignation={(designation) =>
                  setData((prev) => ({
                    ...prev,
                    leftSignatory: { ...(prev.leftSignatory || {}), designation },
                  }))
                }
                onUpload={(file) => onSignatureUpload('leftSignatory', file)}
                onClearImage={() =>
                  setData((prev) => ({
                    ...prev,
                    leftSignatory: { ...(prev.leftSignatory || {}), imageUrl: '' },
                  }))
                }
                stampLabel="Use brand seal as stamp"
                stampValue={!!data.useBrandSealAsStamp}
                onStampToggle={(v) => updateData('useBrandSealAsStamp', v)}
              />
              <SignatorySection
                title="Customer Signatory (right)"
                hidden={!!data.hideRightSignatory}
                onHiddenChange={(v) => updateData('hideRightSignatory', v)}
                hideLabel="Hide customer signature on this document"
                signatoryName={data.rightSignatory?.name || ''}
                signatoryDesignation={data.rightSignatory?.designation || ''}
                signatoryImage={data.rightSignatory?.imageUrl}
                onChangeName={(name) =>
                  setData((prev) => ({
                    ...prev,
                    rightSignatory: { ...(prev.rightSignatory || {}), name },
                  }))
                }
                onChangeDesignation={(designation) =>
                  setData((prev) => ({
                    ...prev,
                    rightSignatory: { ...(prev.rightSignatory || {}), designation },
                  }))
                }
                onUpload={(file) => onSignatureUpload('rightSignatory', file)}
                onClearImage={() =>
                  setData((prev) => ({
                    ...prev,
                    rightSignatory: { ...(prev.rightSignatory || {}), imageUrl: '' },
                  }))
                }
                stampLabel="Custom stamp image (replaces brand seal on this side)"
                customStampUrl={data.customStampUrl || ''}
                onCustomStampUpload={onCustomStampUpload}
                onCustomStampClear={() => updateData('customStampUrl', '')}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base font-semibold text-slate-900">Notes &amp; Terms</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lh-notes">Notes</Label>
                <Textarea
                  id="lh-notes"
                  rows={4}
                  value={data.notes || ''}
                  onChange={(e) => updateData('notes', e.target.value)}
                  placeholder="Anything that should appear under the signatures…"
                />
              </div>
              <div>
                <Label htmlFor="lh-terms">Terms (one per line)</Label>
                <Textarea
                  id="lh-terms"
                  rows={4}
                  value={data.terms || ''}
                  onChange={(e) => updateData('terms', e.target.value)}
                  placeholder={'1. Equipment is in working condition.\n2. Spare parts billed separately.'}
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!data.hideBrandFooter}
                    onChange={(e) => updateData('hideBrandFooter', e.target.checked)}
                  />
                  Hide brand thank-you footer
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={data.showPageBorder !== false}
                    onChange={(e) => updateData('showPageBorder', e.target.checked)}
                  />
                  Print decorative page border (letterhead frame)
                </label>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Preview */}
        <aside
          className={
            (showMobilePreview
              ? 'fixed inset-0 z-40 bg-black/40 lg:bg-transparent lg:static lg:inset-auto'
              : 'hidden lg:block') + ' lg:col-span-3'
          }
        >
          <div
            className={
              showMobilePreview
                ? 'mx-2 mt-12 h-[80vh] rounded-md bg-white shadow-xl overflow-hidden lg:m-0 lg:h-auto lg:rounded lg:shadow-none'
                : ''
            }
          >
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="py-3 px-4 sm:px-6 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                      <Eye className="w-4 h-4" />
                    </span>
                    Live Preview
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Final PDF will look exactly like this.
                  </CardDescription>
                </div>
                {showMobilePreview && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowMobilePreview(false)}
                  >
                    Close
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4">
                <iframe
                  ref={previewIframeRef}
                  title="Letterhead preview"
                  className="w-full rounded border bg-white"
                  style={{ minHeight: showMobilePreview ? '70vh' : '900px' }}
                  sandbox="allow-same-origin"
                />
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar — keeps the most-used actions reachable
          without scrolling on phones. Hidden on lg+ where the top header bar
          already exposes Save / PDF / Print. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur shadow-[0_-2px_6px_rgba(15,23,42,0.05)]">
        <div className="mx-auto w-full max-w-[1600px] grid grid-cols-4 gap-1 px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMobilePreview((v) => !v)}
            className="flex flex-col items-center justify-center h-12 gap-0.5 text-[11px]"
          >
            <Eye className="w-4 h-4" />
            {showMobilePreview ? 'Hide' : 'Preview'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveDraft}
            className="flex flex-col items-center justify-center h-12 gap-0.5 text-[11px]"
          >
            <Save className="w-4 h-4" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="flex flex-col items-center justify-center h-12 gap-0.5 text-[11px]"
          >
            <FileDown className="w-4 h-4" />
            PDF
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            className="flex flex-col items-center justify-center h-12 gap-0.5 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset current document?</AlertDialogTitle>
            <AlertDialogDescription>
              The fields and body blocks will be cleared back to the starter
              template for this document type. Saved drafts won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirmed}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Compact icon+label button used by the Body toolbar — keeps each button the
 *  same width on mobile (grid-cols-4) and aligned in a row on larger screens. */
function ToolbarPill({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100"
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Flatten a customer search row into the fields the document needs. */
function customerRowToDocPatch(row: any): Partial<LetterheadDocumentData> {
  const address = row?.address || {};
  const siteParts = [
    address?.street,
    address?.area,
    address?.city,
    address?.pincode ? `- ${address.pincode}` : '',
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  const siteFromAddress = siteParts.join(', ');
  const siteFromLocation =
    typeof row?.location?.formattedAddress === 'string'
      ? row.location.formattedAddress.trim()
      : '';
  // Prefer the structured address when present so the printed document is consistent.
  const siteLocation = siteFromAddress || siteFromLocation || row?.visible_address || '';
  return {
    customerId: row?.id || '',
    customerCode: row?.customer_id || '',
    customerName: row?.full_name || '',
    customerCompany: row?.visible_address || '',
    customerPhone: row?.phone || '',
    customerEmail: row?.email || '',
    siteLocation,
  };
}

function buildCustomerSummary(data: LetterheadDocumentData): string {
  const parts = [
    data.customerName,
    data.customerCode ? `(${data.customerCode})` : '',
    data.customerPhone,
  ].filter(Boolean);
  return parts.join(' ');
}

interface CustomerPickerProps {
  selectedSummary: string | null;
  onPick: (patch: Partial<LetterheadDocumentData>) => void;
  onClear: () => void;
}

function CustomerPicker({ selectedSummary, onPick, onClear }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  /** True once the user has actually run a search — drives the "No matches" state. */
  const [hasSearched, setHasSearched] = useState(false);
  /** Tracks the most recent search so we never apply stale results when the user
   *  hits Search again before the previous call finishes. */
  const requestIdRef = useRef(0);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.info('Type at least 2 characters to search');
      return;
    }
    const myId = ++requestIdRef.current;
    setLoading(true);
    setHasSearched(true);
    try {
      const { data: rows, error } = await db.customers.searchSlim(trimmed, 10, {
        includeAddressAndLocation: true,
      });
      if (myId !== requestIdRef.current) return; // stale response
      if (error) {
        console.warn('[letterhead] customer search error', error);
        setResults([]);
        toast.error('Customer search failed');
      } else {
        setResults(Array.isArray(rows) ? rows : []);
      }
    } catch (err) {
      if (myId !== requestIdRef.current) return;
      console.warn('[letterhead] customer search exception', err);
      setResults([]);
    } finally {
      if (myId === requestIdRef.current) setLoading(false);
    }
  }, [query]);

  const handlePick = (row: any) => {
    onPick(customerRowToDocPatch(row));
    setQuery('');
    setResults([]);
    setHasSearched(false);
    toast.success('Customer linked');
  };

  return (
    <div className="space-y-2">
      {selectedSummary && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-emerald-900 min-w-0">
            <UserCheck className="w-4 h-4 shrink-0 text-emerald-700" />
            <span className="truncate">
              <span className="font-semibold">Linked:</span> {selectedSummary}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 px-2 text-red-600 hover:bg-red-100"
            title="Unlink customer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Name, phone, customer ID or email…"
            className="pl-8"
            aria-label="Search customers"
          />
        </div>
        <Button
          type="button"
          onClick={() => void runSearch()}
          disabled={loading || query.trim().length < 2}
          className="bg-blue-600 hover:bg-blue-700 text-white sm:w-auto w-full"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Search className="w-4 h-4 mr-1" />
          )}
          Search
        </Button>
      </div>

      {hasSearched && !loading && results.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No customers matched. You can still fill the header fields manually.
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {results.map((row) => {
            const id = row?.customer_id || row?.id;
            const label = row?.full_name || 'Unnamed';
            const meta = [
              row?.phone,
              row?.visible_address,
              row?.address?.area || row?.address?.city,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                key={row?.id || id}
                type="button"
                onClick={() => handlePick(row)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50 active:bg-blue-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {label}
                    </span>
                    {id && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {id}
                      </span>
                    )}
                  </div>
                  {meta && (
                    <div className="text-xs text-slate-500 truncate">{meta}</div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Selecting a customer fills name, company, site, phone &amp; email — you can still edit the fields below.
      </p>
    </div>
  );
}

/** True when the body has only empty placeholder blocks (used to decide whether
 *  to swap in fresh starter blocks when the document type changes). */
function allBlocksEmpty(blocks: LetterheadBlock[]): boolean {
  return blocks.every((b) => {
    if (b.kind === 'text') {
      const stripped = b.html.replace(/<[^>]+>/g, '').trim();
      return stripped.length === 0;
    }
    if (b.kind === 'table') {
      return b.rows.every((row) => row.every((cell) => !cell.trim()));
    }
    if (b.kind === 'image') return !b.src;
    return false;
  });
}

interface SignatorySectionProps {
  title: string;
  hidden: boolean;
  hideLabel: string;
  onHiddenChange: (v: boolean) => void;
  signatoryName: string;
  signatoryDesignation: string;
  signatoryImage?: string;
  onChangeName: (v: string) => void;
  onChangeDesignation: (v: string) => void;
  onUpload: (file: File | null) => void;
  onClearImage: () => void;
  stampLabel: string;
  // Left side uses a brand-seal toggle; right side optionally uses a custom stamp upload.
  stampValue?: boolean;
  onStampToggle?: (v: boolean) => void;
  customStampUrl?: string;
  onCustomStampUpload?: (file: File | null) => void;
  onCustomStampClear?: () => void;
}

function SignatorySection({
  title,
  hidden,
  hideLabel,
  onHiddenChange,
  signatoryName,
  signatoryDesignation,
  signatoryImage,
  onChangeName,
  onChangeDesignation,
  onUpload,
  onClearImage,
  stampLabel,
  stampValue,
  onStampToggle,
  customStampUrl,
  onCustomStampUpload,
  onCustomStampClear,
}: SignatorySectionProps) {
  return (
    <div
      className={
        'rounded-md border p-3 space-y-3 ' +
        (hidden ? 'bg-gray-100 opacity-75' : 'bg-gray-50/40')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={hidden}
            onChange={(e) => onHiddenChange(e.target.checked)}
          />
          <span>Hide</span>
        </label>
      </div>
      {hidden && (
        <p className="text-[11px] text-gray-500">
          {hideLabel}. Uncheck to include it again.
        </p>
      )}
      <div>
        <Label className="text-xs">Name</Label>
        <Input
          value={signatoryName}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Full name"
          className="h-8"
          disabled={hidden}
        />
      </div>
      <div>
        <Label className="text-xs">Designation</Label>
        <Input
          value={signatoryDesignation}
          onChange={(e) => onChangeDesignation(e.target.value)}
          placeholder="Authorized Signatory / Manager"
          className="h-8"
          disabled={hidden}
        />
      </div>
      <div>
        <Label className="text-xs">Signature image (optional)</Label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            className="block w-full text-xs"
            disabled={hidden}
          />
          {signatoryImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearImage}
              className="h-7 px-2 text-xs text-red-600"
              disabled={hidden}
            >
              Clear
            </Button>
          )}
        </div>
        {signatoryImage && (
          <img
            src={signatoryImage}
            alt="Signature preview"
            className="mt-2 max-h-12 rounded border bg-white p-1"
          />
        )}
      </div>

      {typeof stampValue === 'boolean' && onStampToggle && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={stampValue}
            onChange={(e) => onStampToggle(e.target.checked)}
            disabled={hidden}
          />
          <span className="text-xs text-gray-700">{stampLabel}</span>
        </div>
      )}

      {onCustomStampUpload && (
        <div>
          <Label className="text-xs">{stampLabel}</Label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                onCustomStampUpload(e.target.files?.[0] ?? null)
              }
              className="block w-full text-xs"
              disabled={hidden}
            />
            {customStampUrl && onCustomStampClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCustomStampClear}
                className="h-7 px-2 text-xs text-red-600"
                disabled={hidden}
              >
                Clear
              </Button>
            )}
          </div>
          {customStampUrl && (
            <img
              src={customStampUrl}
              alt="Custom stamp"
              className="mt-2 max-h-16 rounded border bg-white p-1"
            />
          )}
        </div>
      )}
    </div>
  );
}
