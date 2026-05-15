import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentBrand, getDocumentBrandLabel, getCompanyInfoForBrand } from '@/lib/service-brands';

interface DocumentBrandPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  allowedBrands?: DocumentBrand[];
  onSelect: (brand: DocumentBrand) => void;
}

const ALL_BRANDS: DocumentBrand[] = ['hydrogenro', 'elevenro'];

export default function DocumentBrandPickerDialog({
  open,
  onOpenChange,
  title = 'Select brand',
  description = 'Choose which brand this document should be issued under.',
  allowedBrands = ALL_BRANDS,
  onSelect,
}: DocumentBrandPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {allowedBrands.map((brand) => {
            const company = getCompanyInfoForBrand(brand);
            return (
              <button
                key={brand}
                type="button"
                onClick={() => {
                  onSelect(brand);
                  onOpenChange(false);
                }}
                className="p-4 rounded-lg border-2 border-gray-300 bg-white text-gray-700 hover:border-black hover:bg-gray-50 transition-all text-left"
              >
                <span className="font-semibold text-sm block mb-1">
                  {getDocumentBrandLabel(brand)}
                </span>
                <span className="text-xs text-gray-500 block">{company.phone}</span>
                <span className="text-xs text-gray-500 block truncate">{company.email}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
