import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { deleteAdminCloudinaryPhoto, extractPhotoEntryUrl } from '@/lib/adminPhotoHelpers';
import { db } from '@/lib/supabase';
import type { Job } from '@/types';

export type AdminJobPhotoToDelete = {
  jobId: string;
  photoIndex: number;
  photoUrl: string;
};

export async function deleteAdminJobPhoto(
  photoToDelete: AdminJobPhotoToDelete | null,
  ctx: {
    jobs: Job[];
    selectedJobPhotos: { jobId: string; photos: string[]; type: 'before' | 'after' } | null;
    setIsDeletingPhoto: Dispatch<SetStateAction<boolean>>;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setSelectedJobPhotos: Dispatch<
      SetStateAction<{ jobId: string; photos: string[]; type: 'before' | 'after' } | null>
    >;
    setPhotoGalleryOpen: Dispatch<SetStateAction<boolean>>;
    setDeletePhotoDialogOpen: Dispatch<SetStateAction<boolean>>;
    setPhotoToDelete: Dispatch<SetStateAction<AdminJobPhotoToDelete | null>>;
  }
) {
  if (!photoToDelete) return;

  ctx.setIsDeletingPhoto(true);
  try {
    const job = ctx.jobs.find((j) => j.id === photoToDelete.jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos)
      ? job.before_photos || job.beforePhotos
      : [];
    const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos)
      ? job.after_photos || job.afterPhotos
      : [];

    const updatedBeforePhotos = [...beforePhotos];
    const updatedAfterPhotos = [...afterPhotos];

    const beforePhotoIndex = beforePhotos.findIndex((photo) => {
      const url = extractPhotoEntryUrl(photo);
      return url === photoToDelete.photoUrl;
    });

    if (beforePhotoIndex !== -1) {
      updatedBeforePhotos.splice(beforePhotoIndex, 1);
    } else {
      const afterPhotoIndex = afterPhotos.findIndex((photo) => {
        const url = extractPhotoEntryUrl(photo);
        return url === photoToDelete.photoUrl;
      });

      if (afterPhotoIndex !== -1) {
        updatedAfterPhotos.splice(afterPhotoIndex, 1);
      } else {
        throw new Error('Photo not found in job');
      }
    }

    const { deleted: cloudinaryDeleted, error: cloudinaryErrorMsg } =
      await deleteAdminCloudinaryPhoto(photoToDelete.photoUrl);

    const { error } = await db.jobs.update(photoToDelete.jobId, {
      before_photos: updatedBeforePhotos,
      after_photos: updatedAfterPhotos,
    });

    if (error) {
      throw new Error(error.message);
    }

    ctx.setJobs((prev) =>
      prev.map((j) =>
        j.id === photoToDelete.jobId
          ? { ...j, before_photos: updatedBeforePhotos, after_photos: updatedAfterPhotos }
          : j
      )
    );

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((entry) =>
          entry.id === photoToDelete.jobId
            ? { ...entry, before_photos: updatedBeforePhotos, after_photos: updatedAfterPhotos }
            : entry
        );
      });
      return updated;
    });

    if (ctx.selectedJobPhotos && ctx.selectedJobPhotos.jobId === photoToDelete.jobId) {
      const updatedPhotos = ctx.selectedJobPhotos.photos.filter(
        (_, index) => index !== photoToDelete.photoIndex
      );
      ctx.setSelectedJobPhotos({ ...ctx.selectedJobPhotos, photos: updatedPhotos });

      if (updatedPhotos.length === 0) {
        ctx.setPhotoGalleryOpen(false);
      }
    }

    if (cloudinaryDeleted) {
      toast.success('Photo deleted successfully from both database and Cloudinary');
    } else {
      toast.success(
        cloudinaryErrorMsg
          ? `Photo removed from database. Cloudinary: ${cloudinaryErrorMsg}`
          : 'Photo removed from database. Cloudinary delete failed.'
      );
    }
    ctx.setDeletePhotoDialogOpen(false);
    ctx.setPhotoToDelete(null);
  } catch {
    toast.error('Failed to delete photo');
  } finally {
    ctx.setIsDeletingPhoto(false);
  }
}
