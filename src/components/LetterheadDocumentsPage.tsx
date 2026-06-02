import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
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
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${getLetterheadCss()}</style></head><body>${buildLetterheadInnerHtml(data)}</body></html>`;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-3 md:py-0 md:h-16">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    Letterhead Documents
                  </h1>
                  <p className="text-xs text-gray-500">
                    Service reports, AMC reports, custom letterheads
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {getDocumentBrandLabel(data.brand)}
              </Badge>
              <Badge variant="secondary">
                {LETTERHEAD_DOCUMENT_TYPE_LABEL[data.documentType]}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMobilePreview((v) => !v)}
                className="lg:hidden"
              >
                <Eye className="w-4 h-4 mr-1" />
                {showMobilePreview ? 'Hide preview' : 'Preview'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                <Save className="w-4 h-4 mr-1" /> Save draft
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Sidebar */}
        <aside className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Document Type</CardTitle>
              <CardDescription className="text-xs">
                Switch templates anytime — your current content stays.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {DOCUMENT_TYPES.map((t) => (
                <Button
                  key={t}
                  variant={data.documentType === t ? 'default' : 'outline'}
                  className="w-full justify-start"
                  size="sm"
                  onClick={() => switchDocumentType(t)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {LETTERHEAD_DOCUMENT_TYPE_LABEL[t]}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Brand</CardTitle>
              <CardDescription className="text-xs">
                Auto-loads logo, address & footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button
                variant={data.brand === 'hydrogenro' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchBrand('hydrogenro')}
              >
                Hydrogen RO
              </Button>
              <Button
                variant={data.brand === 'elevenro' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchBrand('elevenro')}
              >
                Eleven RO
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Drafts</CardTitle>
                <CardDescription className="text-xs">
                  Stored on this device.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                title="Reset current document"
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
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" /> Customer
              </CardTitle>
              <CardDescription className="text-xs">
                Search a saved customer to auto-fill name, site, phone &amp; email.
              </CardDescription>
            </CardHeader>
            <CardContent>
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

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Header</CardTitle>
              <CardDescription className="text-xs">
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

          <Card>
            <CardHeader className="py-3 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Body</CardTitle>
                <CardDescription className="text-xs">
                  Mix and match text, tables, images and page breaks.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => addBlock('text')}>
                  <TypeIcon className="w-4 h-4 mr-1" /> Text
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('table')}>
                  <TableProperties className="w-4 h-4 mr-1" /> Table
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('image')}>
                  <ImageIcon className="w-4 h-4 mr-1" /> Image
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('pagebreak')}>
                  <SeparatorHorizontal className="w-4 h-4 mr-1" /> Page break
                </Button>
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

              <div className="flex flex-wrap gap-1 pt-1">
                <Button size="sm" variant="outline" onClick={() => addBlock('text')}>
                  <Plus className="w-4 h-4 mr-1" /> Text
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('table')}>
                  <Plus className="w-4 h-4 mr-1" /> Table
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('image')}>
                  <Plus className="w-4 h-4 mr-1" /> Image
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('pagebreak')}>
                  <Plus className="w-4 h-4 mr-1" /> Page break
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Signatures & Stamp</CardTitle>
              <CardDescription className="text-xs">
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

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Notes & Terms</CardTitle>
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
            <Card>
              <CardHeader className="py-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Live Preview</CardTitle>
                  <CardDescription className="text-xs">
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
              <CardContent>
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
  const [openList, setOpenList] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Debounced search. We re-trigger 220ms after the user stops typing.
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { data: rows, error } = await db.customers.searchSlim(trimmed, 10, {
          includeAddressAndLocation: true,
        });
        if (error) {
          console.warn('[letterhead] customer search error', error);
          setResults([]);
        } else {
          setResults(Array.isArray(rows) ? rows : []);
        }
      } catch (err) {
        console.warn('[letterhead] customer search exception', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePick = (row: any) => {
    onPick(customerRowToDocPatch(row));
    setQuery('');
    setResults([]);
    setOpenList(false);
  };

  return (
    <div className="space-y-2">
      {selectedSummary && (
        <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2">
          <div className="text-sm text-green-900">
            <span className="font-medium">Linked customer:</span> {selectedSummary}
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
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenList(true);
            }}
            onFocus={() => setOpenList(true)}
            placeholder="Search by name, phone, customer ID or email…"
            className="pl-8"
          />
        </div>
        {openList && query.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
            {loading && (
              <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No matches. Customer details below can still be filled manually.
              </div>
            )}
            {!loading &&
              results.map((row) => {
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
                    className="block w-full px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {label}
                      </span>
                      {id && (
                        <span className="text-[10px] uppercase tracking-wide text-blue-600">
                          {id}
                        </span>
                      )}
                    </div>
                    {meta && (
                      <div className="text-xs text-gray-500 truncate">{meta}</div>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
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
