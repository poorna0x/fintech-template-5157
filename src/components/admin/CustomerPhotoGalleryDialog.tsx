import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Customer } from '@/types';
import { Camera, Download, FileText, Image, Images, Loader2, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { fetchWhatsAppR2SignedUrl, purgeWhatsAppMessages } from '@/lib/sendAdminWhatsAppApi';
import {
  isR2MediaRef,
  isWhatsAppOutboundImageMessage,
  listCustomerWhatsAppDocuments,
  removeWhatsAppThreadMessageCache,
  type WhatsAppCustomerDocument,
} from '@/lib/whatsappInbox';
import { cn } from '@/lib/utils';

interface CustomerPhotoGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  customerPhotos: {[customerId: string]: string[]};
  uploadingThumbnails: {[key: string]: {url: string, uploading: boolean}};
  isUploadingPhoto: boolean;
  isLoadingPhotos: boolean;
  isDragOverPhotos: boolean;
  isCompressingImage: boolean;
  onPhotoUpload: (files: FileList) => void;
  onCameraCapture: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPhotoClick: (photo: string, index: number, total: number) => void;
  onDeletePhoto: (photoUrl: string, photoIndex: number) => void;
}

function directHttpsUrl(ref: string | null | undefined): string | null {
  const raw = String(ref || '').trim();
  if (!raw || isR2MediaRef(raw)) return null;
  return /^https:\/\//i.test(raw) ? raw : null;
}

function documentLabel(row: WhatsAppCustomerDocument): string {
  const name = String(row.filename || '').trim();
  if (name) return name;
  if (isWhatsAppOutboundImageMessage(row)) return 'WhatsApp photo';
  if (String(row.media_mime || '').includes('pdf') || row.msg_type === 'pdf') return 'PDF';
  return 'WhatsApp document';
}

const CustomerPhotoGalleryDialog: React.FC<CustomerPhotoGalleryDialogProps> = ({
  open,
  onOpenChange,
  customer,
  customerPhotos,
  uploadingThumbnails,
  isUploadingPhoto,
  isLoadingPhotos,
  isDragOverPhotos,
  isCompressingImage,
  onPhotoUpload,
  onCameraCapture,
  onDragOver,
  onDragLeave,
  onDrop,
  onPhotoClick,
  onDeletePhoto
}) => {
  const [tab, setTab] = useState('photos');
  const [docs, setDocs] = useState<WhatsAppCustomerDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsLoadedFor, setDocsLoadedFor] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const customerId = customer?.customer_id || customer?.customerId || '';
  const customerUuid =
    typeof customer?.id === 'string' && customer.id.includes('-') ? customer.id : '';
  const photos = [...(customerPhotos[customerId] || [])].reverse();
  const uploadingCount = Object.keys(uploadingThumbnails).length;
  const hasPhotos = photos.length > 0 || uploadingCount > 0;
  const loadKey = `${customerUuid || customerId}|${customer?.phone || ''}`;
  const customerPhone = customer?.phone || '';
  const customerAlt =
    customer?.alternate_phone ||
    (customer as { alternatePhone?: string } | null)?.alternatePhone ||
    '';

  useEffect(() => {
    if (!open) {
      setTab('photos');
      return;
    }
    setDocsLoadedFor(null);
    setDocs([]);
    setDocsError(null);
    setTab('photos');
  }, [open, loadKey]);

  // Prefetch WhatsApp docs on open (same whatsapp_messages.media_url — no second copy).
  // Documents tab only appears when at least one doc exists.
  useEffect(() => {
    if (!open || !customer || docsLoadedFor === loadKey) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocsError(null);
    void (async () => {
      const result = await listCustomerWhatsAppDocuments(supabase, {
        customerId: customerUuid || null,
        phone: customerPhone,
        alternatePhone: customerAlt,
        limit: 80,
      });
      if (cancelled) return;
      setDocsLoading(false);
      if (result.error) {
        setDocsError(result.error);
        setDocs([]);
        setDocsLoadedFor(loadKey);
        setTab('photos');
        toast.error('Could not load WhatsApp documents');
        return;
      }
      setDocs(result.rows);
      setDocsLoadedFor(loadKey);
      if (result.rows.length === 0) setTab('photos');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loadKey, customer, customerUuid, customerPhone, customerAlt, docsLoadedFor]);

  if (!customer) return null;

  const showDocumentsTab = docs.length > 0;

  const resolveDocUrl = async (row: WhatsAppCustomerDocument): Promise<string | null> => {
    const direct = directHttpsUrl(row.media_url);
    if (direct) return direct;
    const signed = await fetchWhatsAppR2SignedUrl({
      mediaUrl: row.media_url,
      messageId: row.id,
    });
    return signed.ok && signed.url ? signed.url : null;
  };

  const openDoc = async (row: WhatsAppCustomerDocument) => {
    setBusyDocId(row.id);
    try {
      const url = await resolveDocUrl(row);
      if (!url) {
        toast.error('Could not open document');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyDocId(null);
    }
  };

  const downloadDoc = async (row: WhatsAppCustomerDocument) => {
    setBusyDocId(row.id);
    try {
      const url = await resolveDocUrl(row);
      if (!url) {
        toast.error('Could not download document');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = documentLabel(row);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusyDocId(null);
    }
  };

  const deleteDoc = async (row: WhatsAppCustomerDocument) => {
    const label = documentLabel(row);
    if (
      !window.confirm(
        `Delete “${label}” from this customer and Cloudflare?\n\nIt will also be removed from the WhatsApp inbox.`
      )
    ) {
      return;
    }
    setBusyDocId(row.id);
    try {
      const result = await purgeWhatsAppMessages({
        messageId: row.id,
        messageIds: [row.id],
      });
      if (!result.ok) {
        const staleFn = /olderThanDays|phoneE164/i.test(String(result.error || ''));
        if (!staleFn) {
          toast.error(result.error || 'Could not delete file');
          return;
        }
        const { error } = await supabase.from('whatsapp_messages').delete().eq('id', row.id);
        if (error) {
          toast.error(error.message || 'Could not delete file');
          return;
        }
      }
      removeWhatsAppThreadMessageCache(row.id, row.phone_e164);
      const next = docs.filter((d) => d.id !== row.id);
      setDocs(next);
      if (next.length === 0) setTab('photos');
      toast.success('Deleted');
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.25rem)] max-w-7xl max-h-[95vh] overflow-x-hidden overflow-y-auto p-4 sm:w-[90vw] sm:p-6 md:w-[85vw] min-w-0">
        <DialogHeader className="space-y-3 pr-10 sm:space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg sm:text-xl font-semibold">Gallery</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm break-words">
            {showDocumentsTab
              ? 'Customer photos, plus WhatsApp PDFs and photos you sent (same Cloudflare files as the inbox).'
              : 'Photos for this customer'}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={showDocumentsTab ? tab : 'photos'}
          onValueChange={setTab}
          className="w-full min-w-0"
        >
          {showDocumentsTab && (
            <TabsList
              className={cn(
                'grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/60 p-1.5',
                'sm:inline-flex sm:w-auto sm:min-w-[280px]'
              )}
            >
              <TabsTrigger
                value="photos"
                className={cn(
                  'group min-h-[44px] cursor-pointer gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
                  'data-[state=active]:bg-sky-700 data-[state=active]:text-white data-[state=active]:shadow-sm',
                  'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-background/70 data-[state=inactive]:hover:text-foreground'
                )}
              >
                <Images className="h-4 w-4 shrink-0" aria-hidden />
                Photos
                {(photos.length + uploadingCount) > 0 && (
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none group-data-[state=active]:bg-white/20">
                    {photos.length + uploadingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className={cn(
                  'group min-h-[44px] cursor-pointer gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
                  'data-[state=active]:bg-sky-700 data-[state=active]:text-white data-[state=active]:shadow-sm',
                  'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-background/70 data-[state=inactive]:hover:text-foreground'
                )}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                Documents
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none group-data-[state=active]:bg-white/20">
                  {docs.length}
                </span>
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="photos" className="mt-4 space-y-4 sm:space-y-6">
          {/* Upload Area - Only show if no photos and no uploading thumbnails */}
          {!hasPhotos && (
            <div
              className={`border-2 border-dashed rounded-lg p-6 sm:p-12 text-center transition-all duration-200 ${
                isDragOverPhotos 
                  ? 'border-blue-500 bg-blue-100 scale-105' 
                  : 'border-border hover:border-blue-400 hover:bg-blue-50'
              } ${isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) onPhotoUpload(files);
                };
                input.click();
              }}
            >
              <div className="space-y-4 sm:space-y-6">
                <div className="relative">
                  <Camera className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto ${isDragOverPhotos ? 'text-blue-500' : 'text-muted-foreground/70'}`} />
                  {isCompressingImage && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 sm:space-y-3">
                  <div className="text-lg sm:text-xl font-medium text-muted-foreground">
                    {isUploadingPhoto ? 'Uploading photos...' : isDragOverPhotos ? 'Drop photos here' : 'No photos found'}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground px-2">
                    Drag & drop photos here, click to browse, or use camera capture
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          if (files) onPhotoUpload(files);
                        };
                        input.click();
                      }}
                      disabled={isUploadingPhoto}
                      className="flex items-center gap-2 w-full sm:w-auto min-h-[44px]"
                    >
                      <Upload className="w-4 h-4" />
                      Browse Files
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCameraCapture();
                      }}
                      disabled={isUploadingPhoto}
                      className="flex items-center gap-2 w-full sm:w-auto min-h-[44px]"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Photo
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground/70 pt-2 px-2">
                    Supports JPG, PNG, GIF up to 10MB • All photos stored in Cloudinary
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoadingPhotos && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-sm text-muted-foreground">Loading photos...</p>
              </div>
            </div>
          )}

          {/* Photo Grid */}
          {!isLoadingPhotos && hasPhotos && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-base sm:text-lg font-medium">
                  {(() => {
                    const total = photos.length + uploadingCount;
                    return `${total} Photo${total !== 1 ? 's' : ''}${uploadingCount > 0 ? ` (${uploadingCount} uploading...)` : ''}`;
                  })()}
                </h3>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) onPhotoUpload(files);
                      };
                      input.click();
                    }}
                    disabled={isUploadingPhoto}
                    className="flex items-center gap-2 flex-1 sm:flex-none min-h-[44px]"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Add Files</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCameraCapture}
                    disabled={isUploadingPhoto}
                    className="flex items-center gap-2 flex-1 sm:flex-none min-h-[44px]"
                  >
                    <Camera className="w-4 h-4" />
                    Capture
                  </Button>
                </div>
              </div>
              
              <div 
                className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 md:gap-4 p-2 sm:p-4 rounded-lg border-2 border-dashed transition-all ${
                  isDragOverPhotos 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-transparent'
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {/* Show uploading thumbnails first */}
                {Object.entries(uploadingThumbnails).map(([thumbnailId, thumbnail]) => (
                  <div key={thumbnailId} className="relative group">
                    <div className="w-full aspect-square bg-gray-100 rounded-lg border-2 border-dashed border-blue-400 overflow-hidden relative">
                      <img
                        src={thumbnail.url}
                        alt="Uploading..."
                        className="w-full h-full object-cover opacity-60"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="flex flex-col items-center gap-1 sm:gap-2">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-card rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-card rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-card rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-xs text-white font-medium">Uploading...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Show uploaded photos */}
                {photos.map((photo, index) => (
                  <div key={`${customer.id}-${index}`} className="relative group">
                    <div className="w-full aspect-square bg-gray-100 rounded-lg border border-border overflow-hidden cursor-pointer">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onLoad={(e) => {
                          e.currentTarget.style.display = 'block';
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                        onClick={() => onPhotoClick(photo, index, photos.length)}
                      />
                      <div 
                        className="w-full h-full flex items-center justify-center text-muted-foreground/70"
                        style={{ display: 'none' }}
                      >
                        <div className="text-center">
                          <Image className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2" />
                          <div className="text-xs">Failed to load</div>
                        </div>
                      </div>
                      {/* Delete button - always visible on mobile, hover on desktop */}
                      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 touch-manipulation shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePhoto(photo, index);
                          }}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </TabsContent>

          {showDocumentsTab && (
          <TabsContent value="documents" className="mt-4 min-w-0 overflow-x-hidden">
            {docsLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading WhatsApp files…
              </div>
            ) : docsError ? (
              <p className="py-8 text-center text-sm text-red-600">{docsError}</p>
            ) : (
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {docs.length} file{docs.length !== 1 ? 's' : ''} sent on WhatsApp
                </p>
                <p className="text-xs text-muted-foreground break-words">
                  Photos and PDFs stored on Cloudflare. Same as the inbox — delete the chat
                  message and it leaves here too.
                </p>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {docs.map((row) => {
                    const isImage = isWhatsAppOutboundImageMessage(row);
                    return (
                    <li
                      key={row.id}
                      className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                          isImage
                            ? 'bg-sky-500/10 text-sky-700'
                            : 'bg-red-500/10 text-red-600'
                        )}
                      >
                        {isImage ? (
                          <Image className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {documentLabel(row)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      </div>
                      <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[40px] w-full cursor-pointer sm:w-auto"
                          disabled={busyDocId === row.id}
                          onClick={() => void openDoc(row)}
                        >
                          {busyDocId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Open'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 w-full cursor-pointer sm:w-10 sm:px-0"
                          disabled={busyDocId === row.id}
                          onClick={() => void downloadDoc(row)}
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 w-full cursor-pointer text-destructive hover:text-destructive sm:w-10 sm:px-0"
                          disabled={busyDocId === row.id}
                          onClick={() => void deleteDoc(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerPhotoGalleryDialog;
