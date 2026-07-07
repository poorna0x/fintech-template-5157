import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  deleteAdminCloudinaryPhoto,
  extractPhotoEntryUrl,
  normalizeUrlForPhotoMatch,
} from '@/lib/adminPhotoHelpers';
import { db } from '@/lib/supabase';
import type { Customer } from '@/types';

export type AdminCustomerPhotoToDelete = {
  photoUrl: string;
  photoIndex: number;
};

export async function deleteAdminCustomerPhoto(
  customerPhotoToDelete: AdminCustomerPhotoToDelete | null,
  selectedCustomerForPhotos: Customer | null,
  ctx: {
    customerPhotos: Record<string, string[]>;
    selectedPhoto: { url: string; index: number; total: number } | null;
    setIsDeletingCustomerPhoto: Dispatch<SetStateAction<boolean>>;
    setCustomerPhotos: Dispatch<SetStateAction<Record<string, string[]>>>;
    setSelectedPhoto: Dispatch<
      SetStateAction<{ url: string; index: number; total: number } | null>
    >;
    setDeleteCustomerPhotoDialogOpen: Dispatch<SetStateAction<boolean>>;
    setCustomerPhotoToDelete: Dispatch<SetStateAction<AdminCustomerPhotoToDelete | null>>;
    loadCustomerPhotos: (customerId: string) => Promise<void>;
  }
) {
  if (!customerPhotoToDelete || !selectedCustomerForPhotos) return;

  ctx.setIsDeletingCustomerPhoto(true);
  try {
    const customerId =
      selectedCustomerForPhotos.customer_id || selectedCustomerForPhotos.customerId;
    if (!customerId) {
      throw new Error('Customer ID not found');
    }

    const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
    if (customerError || !customer) {
      throw new Error('Customer not found');
    }

    const { data: customerJobsData, error: jobsError } =
      await db.jobs.getByCustomerIdForPhotoAggregation(customer.id);
    if (jobsError) {
      throw new Error(jobsError.message);
    }
    const customerJobs = customerJobsData || [];

    let photoFound = false;
    const photoUrl = customerPhotoToDelete.photoUrl;
    const normalizedPhotoUrl = normalizeUrlForPhotoMatch(photoUrl);

    console.log('Deleting photo:', { original: photoUrl, normalized: normalizedPhotoUrl });

    for (const job of customerJobs) {
      let needsUpdate = false;
      const updateData: Record<string, unknown> = {};

      const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos)
        ? job.before_photos || job.beforePhotos
        : [];
      const beforePhotoIndex = beforePhotos.findIndex((photo: unknown) => {
        const url = extractPhotoEntryUrl(photo);
        return normalizeUrlForPhotoMatch(url) === normalizedPhotoUrl;
      });

      if (beforePhotoIndex !== -1) {
        const updatedBeforePhotos = [...beforePhotos];
        updatedBeforePhotos.splice(beforePhotoIndex, 1);
        updateData.before_photos = updatedBeforePhotos;
        needsUpdate = true;
        photoFound = true;
      }

      const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos)
        ? job.after_photos || job.afterPhotos
        : [];
      const afterPhotoIndex = afterPhotos.findIndex((photo: unknown) => {
        const url = extractPhotoEntryUrl(photo);
        return normalizeUrlForPhotoMatch(url) === normalizedPhotoUrl;
      });

      if (afterPhotoIndex !== -1) {
        const updatedAfterPhotos = [...afterPhotos];
        updatedAfterPhotos.splice(afterPhotoIndex, 1);
        updateData.after_photos = updatedAfterPhotos;
        needsUpdate = true;
        photoFound = true;
      }

      const images = Array.isArray(job.images) ? job.images : [];
      const imageIndex = images.findIndex((photo: unknown) => {
        const url = extractPhotoEntryUrl(photo);
        return normalizeUrlForPhotoMatch(url) === normalizedPhotoUrl;
      });

      if (imageIndex !== -1) {
        const updatedImages = [...images];
        updatedImages.splice(imageIndex, 1);
        updateData.images = updatedImages;
        needsUpdate = true;
        photoFound = true;
      }

      if (job.requirements) {
        try {
          const requirements =
            typeof job.requirements === 'string'
              ? JSON.parse(job.requirements)
              : job.requirements;

          let updatedRequirements = Array.isArray(requirements) ? [...requirements] : [];

          if (!Array.isArray(requirements) && typeof requirements === 'object') {
            updatedRequirements = Object.keys(requirements).map((key) => ({
              [key]: (requirements as Record<string, unknown>)[key],
            }));
          }

          let requirementsChanged = false;

          updatedRequirements = updatedRequirements.map((req: Record<string, unknown>) => {
            if (req.bill_photos && Array.isArray(req.bill_photos)) {
              const filtered = req.bill_photos.filter((photo: unknown) => {
                const url = extractPhotoEntryUrl(photo);
                return normalizeUrlForPhotoMatch(url) !== normalizedPhotoUrl;
              });
              if (filtered.length !== (req.bill_photos as unknown[]).length) {
                requirementsChanged = true;
                photoFound = true;
                return { ...req, bill_photos: filtered };
              }
            }
            return req;
          });

          updatedRequirements = updatedRequirements.map((req: Record<string, unknown>) => {
            if (req.payment_photos && Array.isArray(req.payment_photos)) {
              const filtered = req.payment_photos.filter((photo: unknown) => {
                const url = extractPhotoEntryUrl(photo);
                return normalizeUrlForPhotoMatch(url) !== normalizedPhotoUrl;
              });
              if (filtered.length !== (req.payment_photos as unknown[]).length) {
                requirementsChanged = true;
                photoFound = true;
                return { ...req, payment_photos: filtered };
              }
            }
            return req;
          });

          updatedRequirements = updatedRequirements.map((req: Record<string, unknown>) => {
            if (req.qr_photos && typeof req.qr_photos === 'object') {
              const qrPhotos = req.qr_photos as Record<string, unknown>;
              const screenshotUrl = extractPhotoEntryUrl(qrPhotos.payment_screenshot);
              const normalizedScreenshot = normalizeUrlForPhotoMatch(screenshotUrl);
              if (normalizedScreenshot === normalizedPhotoUrl || screenshotUrl === photoUrl) {
                console.log(`Found photo in qr_photos.payment_screenshot for job ${job.id}`);
                requirementsChanged = true;
                photoFound = true;
                const { payment_screenshot: _removed, ...restQrPhotos } = qrPhotos;
                return { ...req, qr_photos: restQrPhotos };
              }
            }
            return req;
          });

          if (requirementsChanged) {
            updateData.requirements = JSON.stringify(updatedRequirements);
            needsUpdate = true;
          }
        } catch (e) {
          console.error('Error parsing requirements:', e);
        }
      }

      if (needsUpdate) {
        const { error: updateError } = await db.jobs.update(job.id, updateData);
        if (updateError) {
          console.error(`Error updating job ${job.id}:`, updateError);
        }
      }
    }

    if (!photoFound) {
      const customerPhotosList = Array.isArray((customer as any).photos)
        ? (customer as any).photos
        : [];
      const customerPhotoIndex = customerPhotosList.findIndex(
        (p: unknown) =>
          normalizeUrlForPhotoMatch(extractPhotoEntryUrl(p)) === normalizedPhotoUrl
      );
      if (customerPhotoIndex !== -1) {
        const updatedCustomerPhotos = customerPhotosList.filter(
          (_: unknown, i: number) => i !== customerPhotoIndex
        );
        const { error: updateError } = await db.customers.update(customer.id, {
          photos: updatedCustomerPhotos,
        } as any);
        if (updateError) {
          console.error('Error updating customer photos:', updateError);
          throw new Error(updateError.message || 'Failed to remove photo from customer');
        }
        photoFound = true;
      }
    }

    const { deleted: cloudinaryDeleted, error: cloudinaryErrorMsg } =
      await deleteAdminCloudinaryPhoto(photoUrl);

    if (!photoFound) {
      console.warn('Photo not found in any job. Searching for:', normalizedPhotoUrl);
      console.warn('Original URL:', photoUrl);

      console.log('Checking requirements for payment screenshots...');
      for (const job of customerJobs) {
        if (job.requirements) {
          try {
            const reqs =
              typeof job.requirements === 'string'
                ? JSON.parse(job.requirements)
                : job.requirements;
            const reqsArray = Array.isArray(reqs) ? reqs : [reqs];
            reqsArray.forEach((req: Record<string, unknown>) => {
              const qrPhotos = req.qr_photos as Record<string, unknown> | undefined;
              if (qrPhotos?.payment_screenshot) {
                const screenshotUrl = extractPhotoEntryUrl(qrPhotos.payment_screenshot);
                console.log(`Job ${job.job_number} has payment_screenshot:`, screenshotUrl);
                console.log(`  Normalized:`, normalizeUrlForPhotoMatch(screenshotUrl));
                console.log(
                  `  Matches:`,
                  normalizeUrlForPhotoMatch(screenshotUrl) === normalizedPhotoUrl
                );
              }
            });
          } catch (e) {
            console.error('Error checking requirements:', e);
          }
        }
      }

      console.warn(
        'Photo not found in database. Updating UI anyway. Photo may need manual deletion from Cloudinary if API secret is not configured.'
      );
      photoFound = true;
    }

    await ctx.loadCustomerPhotos(customerId);

    const customerIdKey = customerId;
    ctx.setCustomerPhotos((prev) => {
      const updated = { ...prev };
      if (updated[customerIdKey]) {
        updated[customerIdKey] = updated[customerIdKey].filter((url) => url !== photoUrl);
      }
      return updated;
    });

    if (ctx.selectedPhoto && ctx.selectedPhoto.url === photoUrl) {
      const remainingPhotos =
        ctx.customerPhotos[customerIdKey]?.filter((url) => url !== photoUrl) || [];
      if (remainingPhotos.length > 0) {
        const currentIndex = ctx.customerPhotos[customerIdKey]?.indexOf(photoUrl) || 0;
        const newIndex =
          currentIndex < remainingPhotos.length ? currentIndex : remainingPhotos.length - 1;
        ctx.setSelectedPhoto({
          url: remainingPhotos[newIndex],
          index: newIndex,
          total: remainingPhotos.length,
        });
      } else {
        ctx.setSelectedPhoto(null);
      }
    }

    if (cloudinaryDeleted) {
      toast.success('Photo deleted successfully from both database and Cloudinary');
    } else if (photoFound || !cloudinaryErrorMsg) {
      toast.success(
        cloudinaryErrorMsg
          ? `Photo removed from database. Cloudinary: ${cloudinaryErrorMsg}`
          : 'Photo removed from database.'
      );
    } else {
      toast.warning(`Photo removed from UI. Cloudinary: ${cloudinaryErrorMsg}`);
    }

    ctx.setDeleteCustomerPhotoDialogOpen(false);
    ctx.setCustomerPhotoToDelete(null);
  } catch (error) {
    console.error('Error deleting customer photo:', error);
    toast.error(error instanceof Error ? error.message : 'Failed to delete photo');
  } finally {
    ctx.setIsDeletingCustomerPhoto(false);
  }
}
