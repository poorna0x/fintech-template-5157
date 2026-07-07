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
import type { Customer } from '@/types';

type AdminOverrideExistingCustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCustomer: Customer | null;
  onCancel: () => void;
  onConfirmUpdate: () => void;
};

export function AdminOverrideExistingCustomerDialog({
  open,
  onOpenChange,
  existingCustomer,
  onCancel,
  onConfirmUpdate,
}: AdminOverrideExistingCustomerDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Customer Already Exists</AlertDialogTitle>
          <AlertDialogDescription>
            A customer with this phone number or email already exists:
            <br />
            <br />
            <strong>Customer ID:</strong>{' '}
            {(existingCustomer as any)?.customer_id ?? (existingCustomer as any)?.customerId ?? '—'}
            <br />
            <strong>Name:</strong>{' '}
            {(existingCustomer as any)?.full_name ?? (existingCustomer as any)?.fullName ?? '—'}
            <br />
            <strong>Phone:</strong> {existingCustomer?.phone ?? '—'}
            <br />
            <strong>Email:</strong> {existingCustomer?.email ?? '—'}
            <br />
            <br />
            Do you want to continue and update this existing customer with the new information?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmUpdate} className="bg-orange-600 hover:bg-orange-700">
            Continue & Update
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
