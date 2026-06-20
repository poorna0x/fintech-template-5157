import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  documentGenerateBtnClass,
  documentOutlineBtnClass,
} from '@/components/DocumentGeneratorPageHeader';
import { Download, Edit, Eye, MoreHorizontal, Printer, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type GSTInvoiceRowActionsProps = {
  layout?: 'inline' | 'menu';
  onView: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onDelete: () => void;
  className?: string;
};

export function GSTInvoiceRowActions({
  layout = 'inline',
  onView,
  onEdit,
  onPrint,
  onDownload,
  onDelete,
  className,
}: GSTInvoiceRowActionsProps) {
  if (layout === 'menu') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onView}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Generate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center', className)}>
      <Button
        type="button"
        size="sm"
        onClick={onView}
        className={cn(documentGenerateBtnClass, 'h-9 gap-1.5 !shadow-none')}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        View
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onEdit} className="h-9 gap-1.5">
        <Edit className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button type="button" size="sm" onClick={onPrint} className={cn(documentGenerateBtnClass, 'h-9 !shadow-none')}>
        <Printer className="h-3.5 w-3.5 shrink-0" />
        Generate
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onDownload}
        className={cn(documentOutlineBtnClass, 'h-9 !shadow-none')}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        Download
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="col-span-2 h-9 text-red-600 hover:bg-red-50 hover:text-red-700 sm:col-span-1"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>
    </div>
  );
}
