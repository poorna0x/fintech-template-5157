import React from 'react';
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
import type { Customer, Job } from '@/types';

type AdminDeleteConfirmDialogsProps = {
  deleteCustomerOpen: boolean;
  onDeleteCustomerOpenChange: (open: boolean) => void;
  customerToDelete: Customer | null;
  onConfirmDeleteCustomer: () => void;

  deleteJobOpen: boolean;
  onDeleteJobOpenChange: (open: boolean) => void;
  jobToDelete: Job | null;
  onConfirmDeleteJob: () => void;

  deletePhotoOpen: boolean;
  onDeletePhotoOpenChange: (open: boolean) => void;
  isDeletingPhoto: boolean;
  onConfirmDeletePhoto: () => void;

  deleteCustomerPhotoOpen: boolean;
  onDeleteCustomerPhotoOpenChange: (open: boolean) => void;
  isDeletingCustomerPhoto: boolean;
  onConfirmDeleteCustomerPhoto: () => void;
};

export function AdminDeleteConfirmDialogs({
  deleteCustomerOpen,
  onDeleteCustomerOpenChange,
  customerToDelete,
  onConfirmDeleteCustomer,
  deleteJobOpen,
  onDeleteJobOpenChange,
  jobToDelete,
  onConfirmDeleteJob,
  deletePhotoOpen,
  onDeletePhotoOpenChange,
  isDeletingPhoto,
  onConfirmDeletePhoto,
  deleteCustomerPhotoOpen,
  onDeleteCustomerPhotoOpenChange,
  isDeletingCustomerPhoto,
  onConfirmDeleteCustomerPhoto,
}: AdminDeleteConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={deleteCustomerOpen} onOpenChange={onDeleteCustomerOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete customer{' '}
              <strong>{(customerToDelete as any)?.customer_id}</strong> -{' '}
              <strong>{(customerToDelete as any)?.full_name}</strong>?
              <br />
              <br />
              This action cannot be undone and will permanently remove the customer and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteCustomer} className="bg-red-600 hover:bg-red-700">
              Delete Customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteJobOpen} onOpenChange={onDeleteJobOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job <strong>{(jobToDelete as any)?.job_number}</strong>?
              <br />
              <br />
              This action cannot be undone and will permanently remove the job and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteJob} className="bg-red-600 hover:bg-red-700">
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePhotoOpen} onOpenChange={onDeletePhotoOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo?
              <br />
              <br />
              This action cannot be undone and will permanently remove the photo from the job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPhoto}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeletePhoto}
              disabled={isDeletingPhoto}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingPhoto ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </div>
              ) : (
                'Delete Photo'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteCustomerPhotoOpen} onOpenChange={onDeleteCustomerPhotoOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo?
              <br />
              <br />
              This action cannot be undone and will permanently remove the photo from all associated jobs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomerPhoto}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteCustomerPhoto}
              disabled={isDeletingCustomerPhoto}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingCustomerPhoto ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </div>
              ) : (
                'Delete Photo'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
