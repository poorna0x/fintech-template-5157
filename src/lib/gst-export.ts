import * as XLSX from 'xlsx';

export interface TaxInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'B2B' | 'B2C';
  customer_id?: string;
  customer_name: string;
  customer_address: any;
  customer_phone?: string;
  customer_email?: string;
  customer_gstin?: string;
  company_info: any;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    taxRate: number;
    taxAmount: number;
    hsnCode?: string;
    discount?: number;
  }>;
  place_of_supply?: string;
  place_of_supply_code?: string;
  is_intra_state: boolean;
  subtotal: number;
  total_discount: number;
  service_charge: number;
  total_tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  gst_breakup?: any;
  reverse_charge?: boolean;
  e_way_bill_no?: string;
  vehicle_no?: string;
  created_at: string;
}

/**
 * Export GST invoices to CSV format (GST Standard Format)
 * Format follows GSTR-1 style for easy GST filing
 */
export function exportGSTInvoicesToCSV(invoices: TaxInvoice[], filename: string = 'GST_Invoices'): void {
  if (invoices.length === 0) {
    alert('No invoices to export');
    return;
  }

  // Prepare data in GST standard format
  const csvRows: string[] = [];
  
  // Header row - GST Standard Format
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Invoice Type',
    'Customer Name',
    'Customer GSTIN',
    'Place of Supply',
    'Place of Supply Code',
    'HSN/SAC Code',
    'Item Description',
    'Quantity',
    'Unit Price',
    'Taxable Value',
    'GST Rate (%)',
    'CGST Amount',
    'SGST Amount',
    'IGST Amount',
    'Total GST',
    'Total Invoice Value',
    'Customer Phone',
    'Customer Email',
    'E-Way Bill No',
    'Vehicle No',
    'Reverse Charge'
  ];
  
  csvRows.push(headers.join(','));

  // Process each invoice
  invoices.forEach(invoice => {
    // If invoice has multiple items, create a row for each item
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item, itemIndex) => {
        const baseAmount = item.quantity * item.unitPrice;
        const discount = item.discount || 0;
        const taxableValue = Math.max(0, baseAmount - discount);
        
        // Calculate CGST/SGST/IGST for this item
        let itemCGST = 0;
        let itemSGST = 0;
        let itemIGST = 0;
        
        if (invoice.is_intra_state) {
          itemCGST = item.taxAmount / 2;
          itemSGST = item.taxAmount / 2;
        } else {
          itemIGST = item.taxAmount;
        }

        const row = [
          invoice.invoice_number,
          formatDateForCSV(invoice.invoice_date),
          invoice.invoice_type,
          escapeCSV(invoice.customer_name),
          invoice.customer_gstin || '',
          invoice.place_of_supply || '',
          invoice.place_of_supply_code || '',
          (item as any).hsnCode || '',
          escapeCSV(item.description),
          item.quantity.toString(),
          item.unitPrice.toFixed(2),
          taxableValue.toFixed(2),
          item.taxRate.toString(),
          itemCGST.toFixed(2),
          itemSGST.toFixed(2),
          itemIGST.toFixed(2),
          item.taxAmount.toFixed(2),
          // Total invoice value only on first item row
          itemIndex === 0 ? invoice.total_amount.toFixed(2) : '',
          invoice.customer_phone || '',
          invoice.customer_email || '',
          invoice.e_way_bill_no || '',
          invoice.vehicle_no || '',
          invoice.reverse_charge ? 'Yes' : 'No'
        ];
        
        csvRows.push(row.join(','));
      });
    } else {
      // Invoice with no items - create summary row
      const row = [
        invoice.invoice_number,
        formatDateForCSV(invoice.invoice_date),
        invoice.invoice_type,
        escapeCSV(invoice.customer_name),
        invoice.customer_gstin || '',
        invoice.place_of_supply || '',
        invoice.place_of_supply_code || '',
        '',
        'Service/Product',
        '1',
        invoice.subtotal.toFixed(2),
        invoice.subtotal.toFixed(2),
        '0',
        invoice.cgst.toFixed(2),
        invoice.sgst.toFixed(2),
        invoice.igst.toFixed(2),
        invoice.total_tax.toFixed(2),
        invoice.total_amount.toFixed(2),
        invoice.customer_phone || '',
        invoice.customer_email || '',
        (invoice as any).e_way_bill_no || '',
        (invoice as any).vehicle_no || '',
        invoice.reverse_charge ? 'Yes' : 'No'
      ];
      
      csvRows.push(row.join(','));
    }
  });

  // Create CSV content
  const csvContent = csvRows.join('\n');
  
  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${formatDateForFilename(new Date())}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export GST invoices to Excel format (GST Standard Format)
 * Creates a properly formatted Excel file with multiple sheets
 */
export function exportGSTInvoicesToExcel(invoices: TaxInvoice[], filename: string = 'GST_Invoices'): void {
  if (invoices.length === 0) {
    alert('No invoices to export');
    return;
  }

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Detailed Invoice Data (GSTR-1 Style)
  const detailedData: any[] = [];
  
  // Header row
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Invoice Type',
    'Customer Name',
    'Customer GSTIN',
    'Place of Supply',
    'Place of Supply Code',
    'HSN/SAC Code',
    'Item Description',
    'Quantity',
    'Unit Price',
    'Taxable Value',
    'GST Rate (%)',
    'CGST Amount',
    'SGST Amount',
    'IGST Amount',
    'Total GST',
    'Total Invoice Value',
    'Customer Phone',
    'Customer Email',
    'E-Way Bill No',
    'Vehicle No',
    'Reverse Charge'
  ];
  
  detailedData.push(headers);

  // Process each invoice
  invoices.forEach(invoice => {
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item, itemIndex) => {
        const baseAmount = item.quantity * item.unitPrice;
        const discount = item.discount || 0;
        const taxableValue = Math.max(0, baseAmount - discount);
        
        let itemCGST = 0;
        let itemSGST = 0;
        let itemIGST = 0;
        
        if (invoice.is_intra_state) {
          itemCGST = item.taxAmount / 2;
          itemSGST = item.taxAmount / 2;
        } else {
          itemIGST = item.taxAmount;
        }

        const row = [
          invoice.invoice_number,
          formatDateForCSV(invoice.invoice_date),
          invoice.invoice_type,
          invoice.customer_name,
          invoice.customer_gstin || '',
          invoice.place_of_supply || '',
          invoice.place_of_supply_code || '',
          (item as any).hsnCode || '',
          item.description,
          item.quantity,
          item.unitPrice,
          taxableValue,
          item.taxRate,
          itemCGST,
          itemSGST,
          itemIGST,
          item.taxAmount,
          itemIndex === 0 ? invoice.total_amount : '',
          invoice.customer_phone || '',
          invoice.customer_email || '',
          invoice.e_way_bill_no || '',
          invoice.vehicle_no || '',
          invoice.reverse_charge ? 'Yes' : 'No'
        ];
        
        detailedData.push(row);
      });
    } else {
      const row = [
        invoice.invoice_number,
        formatDateForCSV(invoice.invoice_date),
        invoice.invoice_type,
        invoice.customer_name,
        invoice.customer_gstin || '',
        invoice.place_of_supply || '',
        invoice.place_of_supply_code || '',
        '',
        'Service/Product',
        1,
        invoice.subtotal,
        invoice.subtotal,
        0,
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
        invoice.total_tax,
        invoice.total_amount,
        invoice.customer_phone || '',
        invoice.customer_email || '',
        (invoice as any).e_way_bill_no || '',
        (invoice as any).vehicle_no || '',
        invoice.reverse_charge ? 'Yes' : 'No'
      ];
      
      detailedData.push(row);
    }
  });

  // Create detailed sheet
  const detailedSheet = XLSX.utils.aoa_to_sheet(detailedData);
  
  // Set column widths
  detailedSheet['!cols'] = [
    { wch: 18 }, // Invoice Number
    { wch: 12 }, // Invoice Date
    { wch: 10 }, // Invoice Type
    { wch: 25 }, // Customer Name
    { wch: 15 }, // Customer GSTIN
    { wch: 20 }, // Place of Supply
    { wch: 8 },  // Place of Supply Code
    { wch: 12 }, // HSN/SAC Code
    { wch: 30 }, // Item Description
    { wch: 8 },  // Quantity
    { wch: 12 }, // Unit Price
    { wch: 12 }, // Taxable Value
    { wch: 10 }, // GST Rate
    { wch: 12 }, // CGST Amount
    { wch: 12 }, // SGST Amount
    { wch: 12 }, // IGST Amount
    { wch: 12 }, // Total GST
    { wch: 15 }, // Total Invoice Value
    { wch: 15 }, // Customer Phone
    { wch: 25 }, // Customer Email
    { wch: 15 }, // E-Way Bill No
    { wch: 15 }, // Vehicle No
    { wch: 12 }  // Reverse Charge
  ];
  
  XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Invoice Details');

  // Sheet 2: Summary by GST Rate
  const summaryData: any[] = [];
  summaryData.push([
    'GST Rate (%)',
    'Taxable Value',
    'CGST Amount',
    'SGST Amount',
    'IGST Amount',
    'Total GST Amount',
    'Number of Invoices'
  ]);

  // Calculate summary by GST rate
  const summaryByRate: Record<number, {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    count: number;
  }> = {};

  invoices.forEach(invoice => {
    if (invoice.gst_breakup) {
      Object.entries(invoice.gst_breakup).forEach(([rate, data]: [string, any]) => {
        const rateNum = parseFloat(rate);
        if (!summaryByRate[rateNum]) {
          summaryByRate[rateNum] = {
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            count: 0
          };
        }
        
        summaryByRate[rateNum].taxable += data.taxableAmount || 0;
        summaryByRate[rateNum].count += 1;
        
        if (invoice.is_intra_state) {
          summaryByRate[rateNum].cgst += (data.taxAmount || 0) / 2;
          summaryByRate[rateNum].sgst += (data.taxAmount || 0) / 2;
        } else {
          summaryByRate[rateNum].igst += data.taxAmount || 0;
        }
      });
    }
  });

  // Add summary rows
  Object.entries(summaryByRate)
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
    .forEach(([rate, data]) => {
      summaryData.push([
        parseFloat(rate),
        data.taxable.toFixed(2),
        data.cgst.toFixed(2),
        data.sgst.toFixed(2),
        data.igst.toFixed(2),
        (data.cgst + data.sgst + data.igst).toFixed(2),
        data.count
      ]);
    });

  // Add totals row
  const totals = {
    taxable: Object.values(summaryByRate).reduce((sum, d) => sum + d.taxable, 0),
    cgst: Object.values(summaryByRate).reduce((sum, d) => sum + d.cgst, 0),
    sgst: Object.values(summaryByRate).reduce((sum, d) => sum + d.sgst, 0),
    igst: Object.values(summaryByRate).reduce((sum, d) => sum + d.igst, 0),
    count: invoices.length
  };
  
  summaryData.push([
    'TOTAL',
    totals.taxable.toFixed(2),
    totals.cgst.toFixed(2),
    totals.sgst.toFixed(2),
    totals.igst.toFixed(2),
    (totals.cgst + totals.sgst + totals.igst).toFixed(2),
    totals.count
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 }
  ];
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'GST Summary');

  // Sheet 3: Monthly Summary (if applicable)
  const monthlyData: any[] = [];
  monthlyData.push([
    'Month',
    'Year',
    'Number of Invoices',
    'Total Taxable Value',
    'Total CGST',
    'Total SGST',
    'Total IGST',
    'Total GST',
    'Total Invoice Value'
  ]);

  const monthlySummary: Record<string, {
    count: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }> = {};

  invoices.forEach(invoice => {
    const date = new Date(invoice.invoice_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlySummary[monthKey]) {
      monthlySummary[monthKey] = {
        count: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0
      };
    }
    
    monthlySummary[monthKey].count += 1;
    monthlySummary[monthKey].taxable += invoice.subtotal;
    monthlySummary[monthKey].cgst += invoice.cgst;
    monthlySummary[monthKey].sgst += invoice.sgst;
    monthlySummary[monthKey].igst += invoice.igst;
    monthlySummary[monthKey].total += invoice.total_amount;
  });

  Object.entries(monthlySummary)
    .sort()
    .forEach(([monthKey, data]) => {
      const [year, month] = monthKey.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
      
      monthlyData.push([
        monthName,
        year,
        data.count,
        data.taxable.toFixed(2),
        data.cgst.toFixed(2),
        data.sgst.toFixed(2),
        data.igst.toFixed(2),
        (data.cgst + data.sgst + data.igst).toFixed(2),
        data.total.toFixed(2)
      ]);
    });

  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
  monthlySheet['!cols'] = [
    { wch: 15 },
    { wch: 8 },
    { wch: 15 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 }
  ];
  
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Summary');

  // Write file
  XLSX.writeFile(workbook, `${filename}_${formatDateForFilename(new Date())}.xlsx`);
}

// Helper functions
function formatDateForCSV(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
