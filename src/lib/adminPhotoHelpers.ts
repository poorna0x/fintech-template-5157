import { toast } from 'sonner';
import { cloudinaryService } from '@/lib/cloudinary';
import { saveBytesToNativeDownloads } from '@/lib/nativeDownloadsSave';

export function normalizeUrlForPhotoMatch(url: string): string {
  if (!url || typeof url !== 'string') return '';
  return url.trim().toLowerCase().replace(/\/+$/, '').split('?')[0].split('#')[0];
}

export function extractPhotoEntryUrl(photo: unknown): string {
  if (typeof photo === 'string') {
    return photo;
  }
  if (photo && typeof photo === 'object') {
    const entry = photo as Record<string, unknown>;
    return String(entry.secure_url || entry.url || entry.public_id || '');
  }
  return '';
}

export function filterValidJobGalleryPhotos(photos: string[]): string[] {
  return Array.isArray(photos)
    ? photos.filter((photo) => photo && typeof photo === 'string' && photo.trim() !== '')
    : [];
}

export async function deleteAdminCloudinaryPhoto(
  photoUrl: string
): Promise<{ deleted: boolean; error?: string }> {
  try {
    const publicIdInfo = cloudinaryService.extractPublicId(photoUrl);
    if (!publicIdInfo) {
      console.warn('Could not extract public_id from URL:', photoUrl);
      return { deleted: false };
    }

    const result = await cloudinaryService.deleteImage(
      publicIdInfo.publicId,
      publicIdInfo.useSecondary
    );
    if (result.success) {
      console.log(`✅ Photo deleted from Cloudinary: ${publicIdInfo.publicId}`);
      return { deleted: true };
    }

    console.warn(`⚠️ Failed to delete photo from Cloudinary: ${publicIdInfo.publicId}`, result.error);
    return { deleted: false, error: result.error };
  } catch (cloudinaryError) {
    const error =
      cloudinaryError instanceof Error ? cloudinaryError.message : 'Request failed';
    console.error('Error deleting photo from Cloudinary:', cloudinaryError);
    return { deleted: false, error };
  }
}

export async function downloadAdminPhoto(
  photoUrl: string,
  photoIndex: number,
  meta?: { customerName?: string; type?: string } | null
) {
  try {
    let fetchUrl = photoUrl;
    if (photoUrl.includes('cloudinary.com')) {
      fetchUrl = photoUrl.replace(/\/upload\/[^/]*\//, '/upload/');
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    const ext =
      blob.type && blob.type.includes('/') ? blob.type.split('/')[1].split('+')[0] : 'jpg';

    const sanitize = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    let baseName = `photo-${photoIndex + 1}`;
    if (meta?.customerName || meta?.type) {
      const parts = [
        meta.customerName ? sanitize(meta.customerName) : '',
        meta.type === 'bill'
          ? 'bill'
          : meta.type === 'payment'
            ? 'payment'
            : sanitize(meta.type || ''),
        String(photoIndex + 1),
      ].filter(Boolean);
      baseName = parts.join('_');
    }

    const filename = `${baseName}.${ext}`;
    const mimeType = blob.type && blob.type.includes('/') ? blob.type : `image/${ext}`;
    const buffer = await blob.arrayBuffer();

    const savedNative = await saveBytesToNativeDownloads(buffer, filename, mimeType);
    if (savedNative) {
      toast.success('Photo saved to Downloads');
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);

    toast.success('Photo downloaded');
  } catch {
    try {
      const newWindow = window.open(photoUrl, '_blank', 'noopener,noreferrer');
      if (newWindow) {
        toast.info('Photo opened in new tab. Right-click and "Save image as" to download.');
      } else {
        throw new Error('Popup blocked');
      }
    } catch {
      toast.error('Unable to download. Please right-click the photo and select "Save image as"');
    }
  }
}

export async function copyAdminPhotoLink(photoUrl: string) {
  try {
    await navigator.clipboard.writeText(photoUrl);
    toast.success('Photo link copied to clipboard');
  } catch {
    toast.error('Failed to copy link');
  }
}
