import React from 'react';
import { Bell, Camera, Pencil } from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ImageUpload from '@/components/ImageUpload';
import type { Job } from '@/types';

interface CompletionFinishSectionProps {
  job: Job | null;
  extraPhotos: string[];
  onExtraPhotosChange: (images: string[]) => void;
  onUploadStateChange: (uploading: boolean) => void;
  onSetReminder: () => void;
  onUpdateCustomerInfo: () => void;
  dontSendMessage: boolean;
  onDontSendMessageChange: (checked: boolean) => void;
  askForReview: boolean;
  onAskForReviewChange: (checked: boolean) => void;
}

const CompletionFinishSection: React.FC<CompletionFinishSectionProps> = ({
  job,
  extraPhotos,
  onExtraPhotosChange,
  onUploadStateChange,
  onSetReminder,
  onUpdateCustomerInfo,
  dontSendMessage,
  onDontSendMessageChange,
  askForReview,
  onAskForReviewChange,
}) => {
  const hasCustomer = Boolean(
    job?.customer || (job as { customer_id?: string })?.customer_id
  );

  return (
    <div className="space-y-4">
      {hasCustomer && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Before you finish</p>
            <p className="text-xs text-gray-500 mt-0.5">Optional — customer follow-up & details</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onUpdateCustomerInfo}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Pencil className="h-5 w-5 text-gray-700" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">Update customer info</span>
                <span className="block text-xs text-gray-500 truncate">Name, email, address</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onSetReminder}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Bell className="h-5 w-5 text-gray-700" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">Set reminder</span>
                <span className="block text-xs text-gray-500 truncate">Follow-up for this customer</span>
              </span>
            </button>
            <label className="sm:col-span-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={dontSendMessage}
                onChange={(e) => onDontSendMessageChange(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-200">
                <WhatsAppIcon className="h-4 w-4 text-gray-900" />
              </span>
              <span className="text-sm text-gray-700">Don&apos;t send completion message to customer</span>
            </label>
            <label className="sm:col-span-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={askForReview}
                onChange={(e) => onAskForReviewChange(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">Ask customer to review us (linked to you)</span>
            </label>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <Camera className="h-5 w-5 text-gray-600" />
          </span>
          <div className="min-w-0 pt-0.5">
            <Label className="text-sm font-semibold text-gray-900">Job photos (optional)</Label>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Sticker on machine, completed work, or site — saved with this job.
            </p>
          </div>
        </div>
        <ImageUpload
          compact
          onImagesChange={onExtraPhotosChange}
          initialImages={extraPhotos}
          onUploadStateChange={onUploadStateChange}
          maxImages={5}
          folder="ro-service"
          title=""
          description=""
          maxWidth={1024}
          quality={0.5}
          aggressiveCompression
          jobId={job?.id}
          photoType="after"
        />
      </div>
    </div>
  );
};

export default CompletionFinishSection;

interface CompletionPhotoStepProps {
  label: string;
  hint: string;
  images: string[];
  onImagesChange: (images: string[]) => void;
  onCaptureSourcesChange?: (sources: Record<string, 'camera' | 'gallery'>) => void;
  onUploadStateChange: (uploading: boolean) => void;
  maxImages?: number;
  folder: string;
  jobId?: string;
  photoType?: 'bill' | 'payment' | 'after' | 'other';
  maxWidth?: number;
  quality?: number;
  useSecondaryAccount?: boolean;
  /** Skip card chrome when parent dialog already has a title (keeps missing-photo dialog short). */
  dense?: boolean;
}

export const CompletionPhotoStep: React.FC<CompletionPhotoStepProps> = ({
  label,
  hint,
  images,
  onImagesChange,
  onCaptureSourcesChange,
  onUploadStateChange,
  maxImages = 5,
  folder,
  jobId,
  photoType,
  maxWidth = 1024,
  quality = 0.5,
  useSecondaryAccount = false,
  dense = false,
}) => (
  <div
    className={
      dense
        ? 'space-y-2'
        : 'rounded-xl border border-gray-200 bg-white shadow-sm p-4'
    }
  >
    {!dense && (
      <div className="flex items-start gap-3 mb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
          <Camera className="h-5 w-5 text-gray-600" />
        </span>
        <div className="min-w-0 pt-0.5">
          <Label className="text-sm font-semibold text-gray-900">{label}</Label>
          {hint ? (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{hint}</p>
          ) : null}
        </div>
      </div>
    )}
    <ImageUpload
      compact
      onImagesChange={onImagesChange}
      onCaptureSourcesChange={onCaptureSourcesChange}
      initialImages={images}
      onUploadStateChange={onUploadStateChange}
      maxImages={maxImages}
      folder={folder}
      title=""
      description=""
      maxWidth={maxWidth}
      quality={quality}
      aggressiveCompression
      jobId={jobId}
      photoType={photoType}
      useSecondaryAccount={useSecondaryAccount}
    />
  </div>
);
