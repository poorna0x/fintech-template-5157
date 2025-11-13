// Tax Invoice PDF Generation utility
// Based on bill PDF generator but with GST breakdown

import { sanitizeForTemplate } from './sanitize';

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  
  const convertHundreds = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100);
  };
  
  let result = '';
  let remaining = Math.floor(num);
  
  if (remaining >= 10000000) {
    result += convertHundreds(Math.floor(remaining / 10000000)) + 'Crore ';
    remaining %= 10000000;
  }
  if (remaining >= 100000) {
    result += convertHundreds(Math.floor(remaining / 100000)) + 'Lakh ';
    remaining %= 100000;
  }
  if (remaining >= 1000) {
    result += convertHundreds(Math.floor(remaining / 1000)) + 'Thousand ';
    remaining %= 1000;
  }
  if (remaining > 0) {
    result += convertHundreds(remaining);
  }
  
  const paise = Math.round((num - Math.floor(num)) * 100);
  const words = result.trim() + ' Rupees';
  if (paise > 0) {
    return words + ' and ' + paise + ' Paise Only';
  }
  return words + ' Only';
}

export interface PDFTaxInvoiceData {
  billNumber: string;
  billDate: string;
  company: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber: string;
    panNumber: string;
    website?: string;
  };
  customer: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber?: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    taxRate: number;
    taxAmount: number;
    hsnCode?: string;
  }>;
  subtotal: number;
  totalTax: number;
  serviceCharge?: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string;
  notes?: string;
  terms?: string;
  gstData?: {
    placeOfSupply?: string;
    isIntraState?: boolean;
    gstBreakup?: Record<number, { taxableAmount: number; taxAmount: number }>;
    taxSplit?: { cgst: number; sgst: number; igst: number };
    reverseCharge?: boolean;
    eWayBillNo?: string;
    transportMode?: string;
    vehicleNo?: string;
    roundOff?: number;
    customerGstRequired?: boolean;
    placeOfSupplyCode?: string;
  };
  invoiceDetails?: {
    invoiceType?: 'B2B' | 'B2C';
    poNumber?: string;
    paymentDueDate?: string;
    deliveryAddress?: {
      street?: string;
      area?: string;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;
    totalDiscount?: number;
  };
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branchName?: string;
    accountHolderName?: string;
  };
}

export function generateTaxInvoicePDF(billData: PDFTaxInvoiceData, action: 'print' | 'pdf' = 'print'): void {
  try {
    // Check if it's a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // For mobile devices, use a different approach
      handleMobilePrint(billData, action);
      return;
    }
    
    // Create a new window for printing to avoid destroying React components
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Please allow popups to print the tax invoice');
      return;
    }
    
    // Create the tax invoice content
    const invoiceContent = createTaxInvoiceContent(billData);
    
    // Write content to new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tax Invoice - ${billData.billNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
          
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
        body {
            font-family: 'Poppins', sans-serif;
            line-height: 1.4;
            color: #333;
            background: white;
            margin: 0;
            padding: 15mm;
            font-size: 11px;
        }
      
      .bill-container {
            width: 100%;
            max-width: 100%;
            margin: 0;
            background: white;
            padding: 0;
            border: 2px solid #000;
            box-sizing: border-box;
          }
          
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 2px solid #000000;
            padding: 5px 0 8px 0;
          }
          
          .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 15px;
          }
          
          .full-logo {
            max-width: 200px;
            height: auto;
            max-height: 60px;
          }
          
          .company-details {
            font-size: 14px;
            color: #666;
            line-height: 1.4;
          }
          
          .bill-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            gap: 15px;
            padding: 0 5px;
          }
          
          .bill-to, .bill-details {
            flex: 1;
          }
          
          .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #000000;
            margin-bottom: 15px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 5px;
          }
          
          .customer-info, .bill-meta {
            font-size: 14px;
            line-height: 1.5;
          }
          
          .items-table {
            width: calc(100% - 30px);
            border-collapse: collapse;
            margin: 0 15px 15px 15px;
            font-size: 9px;
            table-layout: fixed;
          }
          
          .items-table th {
            background-color: #f8fafc;
            color: #374151;
            font-weight: bold;
            padding: 8px 4px;
            text-align: center;
            border: 1px solid #d1d5db;
          }
          
          .items-table th:nth-child(1) { width: 20%; } /* Description */
          .items-table th:nth-child(2) { width: 7%; } /* HSN/SAC */
          .items-table th:nth-child(3) { width: 7%; } /* Qty */
          .items-table th:nth-child(4) { width: 10%; } /* Unit Price */
          .items-table th:nth-child(5) { width: 10%; } /* Base Amount */
          .items-table th:nth-child(6) { width: 8%; } /* Discount */
          .items-table th:nth-child(7) { width: 10%; } /* Taxable Value */
          .items-table th:nth-child(8) { width: 6%; } /* GST Rate */
          .items-table th:nth-child(9) { width: 10%; } /* GST Amount */
          .items-table th:nth-child(10) { width: 12%; } /* Total */
          
          .items-table td {
            padding: 8px 4px;
            border: 1px solid #d1d5db;
            vertical-align: middle;
            text-align: center;
            word-wrap: break-word;
            overflow: hidden;
          }
          
          .items-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          
          .text-right {
            text-align: right;
          }
          
          .text-center {
            text-align: center;
          }
          
          .summary {
            margin: 15px 15px 0 15px;
            text-align: right;
            width: calc(100% - 30px);
            box-sizing: border-box;
          }
          
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          
          .summary-row.total {
            font-size: 18px;
            font-weight: bold;
            color: #000000;
            border-top: 2px solid #000000;
            border-bottom: 2px solid #000000;
            margin-top: 10px;
            padding: 5px 0;
          }
          
          .notes-section {
            margin: 15px 5px 0 5px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
          }
          
          .notes-title {
            font-size: 16px;
            font-weight: bold;
            color: #374151;
            margin-bottom: 10px;
          }
          
          .notes-content {
            font-size: 14px;
            line-height: 1.5;
            color: #6b7280;
          }
          
          .terms-list {
            margin: 0;
            padding-left: 5px;
          }
          
          .terms-list li {
            margin-bottom: 8px;
            list-style-type: disc;
          }
          
          .signatures {
            display: flex;
            justify-content: center;
            margin: 30px 15px 20px 15px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          
          .signature-box {
            text-align: center;
            padding-top: 15px;
          }
          
          .signature-label {
            font-weight: bold;
            color: #000000;
            margin-bottom: 5px;
            font-size: 14px;
          }
          
          .signature-seal {
            width: 120px;
            height: 120px;
            margin: 20px auto 10px auto;
            display: block;
          }
          
          @media (max-width: 768px) {
            .signature-seal {
              width: 80px;
              height: 80px;
              margin: 15px auto 8px auto;
            }
            
            .signature-label {
              font-size: 12px;
            }
            
            .signature-date {
              font-size: 10px;
            }
          }
          
          .signature-date {
            font-size: 12px;
            color: #6b7280;
          }
          
          .footer {
            margin: 15px 15px 0 15px;
            padding: 10px 0;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 10px;
            color: #6b7280;
        }
      
      @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
        body {
          margin: 0 !important;
              padding: 15mm !important;
              font-size: 12pt !important;
              line-height: 1.4 !important;
        }
        
        .bill-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 20px 1px 20px 1px !important;
              border: none !important;
              box-shadow: none !important;
              background: white !important;
              box-sizing: border-box !important;
              border-radius: 0 !important;
            }
            
            @page {
              size: A4 !important;
              margin: 20mm 8mm 20mm 8mm !important;
              border: 2px solid #000000 !important;
              border-radius: 12px !important;
            }
            
            @page :first {
              margin-top: 20mm !important;
              border: 2px solid #000000 !important;
              border-radius: 12px !important;
            }
            
            @page :left {
              margin-left: 8mm !important;
              margin-right: 5mm !important;
              margin-top: 20mm !important;
              border: 2px solid #000000 !important;
              border-radius: 12px !important;
            }
            
            @page :right {
              margin-left: 5mm !important;
              margin-right: 8mm !important;
              margin-top: 20mm !important;
              border: 2px solid #000000 !important;
              border-radius: 12px !important;
            }
            
            .page-break {
              page-break-before: always !important;
              margin-top: 20px !important;
            }
            
            .new-page-content {
              margin-top: 0 !important;
            }
            
            .bill-container:not(:first-child) {
              padding-top: 20px !important;
            }
          }
        </style>
      </head>
      <body>
        ${invoiceContent}
      </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        if (action === 'print') {
          printWindow.print();
        } else {
          printWindow.print();
        }
        
        // Close the print window after printing
        setTimeout(() => {
          if (printWindow && !printWindow.closed) {
            printWindow.close();
          }
        }, 1000);
      }, 100);
    };
  } catch (error) {
    console.error('Error generating tax invoice PDF:', error);
    alert('Error generating tax invoice. Please try again.');
  }
}

function handleMobilePrint(billData: PDFTaxInvoiceData, action: 'print' | 'pdf'): void {
  // Store original content for restoration
  const originalBodyHTML = document.body.innerHTML;
  const originalTitle = document.title;
  
  const cleanup = () => {
    document.body.innerHTML = originalBodyHTML;
    document.title = originalTitle;
    
    // Remove any added styles
    const addedStyles = document.getElementById('tax-invoice-print-styles');
    if (addedStyles) {
      addedStyles.remove();
    }
    
    // Reload if needed
    if (window.location) {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };
  
  try {
    const invoiceContent = createTaxInvoiceContent(billData);
    const fullHTML = generateTaxInvoiceHTML(billData);
    
    // Parse the HTML to extract body content and styles
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = fullHTML;
    
    // Extract styles from head
    const styleMatch = fullHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const styles = styleMatch ? styleMatch[1] : '';
    
    // Extract body content
    const bodyMatch = fullHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    
    // Inject styles into head
    const styleElement = document.createElement('style');
    styleElement.id = 'tax-invoice-print-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
    
    // Replace body HTML with invoice content
    document.body.innerHTML = bodyContent;
    document.title = `Tax Invoice - ${billData.billNumber}`;
    
    // Force a reflow
    void document.body.offsetHeight;
    
    // Set up print event handlers
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const afterPrintHandler = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      cleanupTimeout = setTimeout(() => {
        cleanup();
        window.removeEventListener('afterprint', afterPrintHandler);
      }, 500);
    };
    
    window.addEventListener('afterprint', afterPrintHandler);
    
    // Trigger print
    setTimeout(() => {
      try {
        if (action === 'print') {
          window.print();
        } else {
          window.print();
        }
        
        // Fallback cleanup
        setTimeout(() => {
          if (cleanupTimeout) {
            cleanup();
          }
        }, 8000);
      } catch (printError) {
        console.error('Error during print:', printError);
        alert('Error generating tax invoice. Please try again.');
        cleanup();
      }
    }, 500);
  } catch (error) {
    console.error('Error generating tax invoice:', error);
    alert('Error generating tax invoice. Please try again.');
    cleanup();
  }
}

function createTaxInvoiceContent(data: PDFTaxInvoiceData): string {
  return `
    <div class="bill-container">
      <!-- Header -->
      <div class="header">
        <div class="logo-container">
          <img src="/fulllogo.webp" alt="Hydrogenro Logo" class="full-logo" />
        </div>
        <div class="company-details">
          <div><strong>TAX INVOICE</strong> ${(data as any).invoiceDetails?.invoiceType ? `<span style="font-size: 12px; margin-left: 10px; padding: 2px 8px; background: #e5e7eb; border-radius: 4px;">${(data as any).invoiceDetails.invoiceType}</span>` : ''}</div>
          <div><strong>${data.company.name}</strong></div>
          <div>${data.company.address}, ${data.company.city} - ${data.company.pincode}</div>
          <div>${data.company.state} (State Code: ${data.gstData?.placeOfSupplyCode || '29'})</div>
          <div>Phone: ${data.company.phone} | Email: ${data.company.email}</div>
          <div><strong>GSTIN:</strong> ${data.company.gstNumber} | <strong>PAN:</strong> ${data.company.panNumber}</div>
          ${data.company.website ? `<div>Website: ${data.company.website}</div>` : ''}
        </div>
      </div>
      
      <!-- Invoice Information -->
      <div class="bill-info">
        <div class="bill-to">
          <div class="section-title">Bill To:</div>
          <div class="customer-info">
            <div><strong>${sanitizeForTemplate(data.customer.name)}</strong></div>
            ${(data as any).invoiceDetails?.invoiceType === 'B2B' ? '<div style="font-size: 11px; color: #059669; font-weight: bold;">(Registered Business - B2B)</div>' : ''}
            ${data.customer.address ? `<div>${sanitizeForTemplate(data.customer.address)}</div>` : ''}
            ${(data.customer.city || data.customer.state || data.customer.pincode) ? `<div>${data.customer.city}, ${data.customer.state} - ${data.customer.pincode}</div>` : ''}
            ${data.customer.phone ? `<div>Phone: ${data.customer.phone}</div>` : ''}
            ${data.customer.email ? `<div>Email: ${data.customer.email}</div>` : ''}
            ${data.customer.gstNumber ? `<div><strong>GSTIN:</strong> ${data.customer.gstNumber}</div>` : ''}
            ${(data as any).invoiceDetails?.invoiceType === 'B2B' && !data.customer.gstNumber ? '<div style="color: #dc2626; font-weight: bold;">⚠ GSTIN Required for B2B Invoice</div>' : ''}
          </div>
        </div>
        
        <div class="bill-details">
          <div class="section-title">Invoice Details:</div>
          <div class="bill-meta">
            <div><strong>Invoice Type:</strong> ${(data as any).invoiceDetails?.invoiceType || 'B2C'} ${(data as any).invoiceDetails?.invoiceType === 'B2B' ? '(Business to Business)' : '(Business to Consumer)'}</div>
            <div><strong>Invoice Number:</strong> ${data.billNumber}</div>
            <div><strong>Invoice Date:</strong> ${new Date(data.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            ${(data as any).invoiceDetails?.poNumber ? `<div><strong>PO Number / Work Order Number:</strong> ${(data as any).invoiceDetails.poNumber} ${(data as any).invoiceDetails?.poNumberRequired ? '<span style="color: #dc2626; font-size: 11px;">(Required for Government)</span>' : ''}</div>` : ''}
            ${data.gstData?.placeOfSupply ? `<div><strong>Place of Supply:</strong> ${data.gstData.placeOfSupply} (State Code: ${data.gstData.placeOfSupplyCode || '29'})</div>` : ''}
            ${(data as any).invoiceDetails?.paymentDueDate ? `<div><strong>Payment Due Date:</strong> ${new Date((data as any).invoiceDetails.paymentDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>` : ''}
            ${data.gstData?.reverseCharge ? `<div><strong>Reverse Charge:</strong> Yes</div>` : ''}
            ${data.gstData?.eWayBillNo ? `<div><strong>E-Way Bill No:</strong> ${data.gstData.eWayBillNo}</div>` : ''}
            ${data.gstData?.vehicleNo ? `<div><strong>Vehicle No:</strong> ${data.gstData.vehicleNo}</div>` : ''}
          </div>
        </div>
      </div>
      
      <!-- Delivery Address (if different) -->
      ${(data as any).invoiceDetails?.deliveryAddress ? `
        <div class="bill-info" style="margin-top: 15px;">
          <div class="bill-to">
            <div class="section-title">Ship To / Delivery Address:</div>
            <div class="customer-info">
              ${(data as any).invoiceDetails.deliveryAddress.street ? `<div>${sanitizeForTemplate((data as any).invoiceDetails.deliveryAddress.street)}</div>` : ''}
              ${(data as any).invoiceDetails.deliveryAddress.area ? `<div>${sanitizeForTemplate((data as any).invoiceDetails.deliveryAddress.area)}</div>` : ''}
              ${((data as any).invoiceDetails.deliveryAddress.city || (data as any).invoiceDetails.deliveryAddress.state || (data as any).invoiceDetails.deliveryAddress.pincode) ? `
                <div>${(data as any).invoiceDetails.deliveryAddress.city || ''}, ${(data as any).invoiceDetails.deliveryAddress.state || ''} - ${(data as any).invoiceDetails.deliveryAddress.pincode || ''}</div>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}
      
      <!-- Items Table with GST -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>HSN/SAC</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Base Amount</th>
            <th>Discount</th>
            <th>Taxable Value</th>
            <th>GST Rate</th>
            <th>GST Amount</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => {
            const baseAmount = item.quantity * item.unitPrice;
            const discount = (item as any).discount || 0;
            const taxableValue = Math.max(0, baseAmount - discount);
            return `
            <tr>
              <td>${sanitizeForTemplate(item.description)}</td>
              <td>${(item as any).hsnCode || ''}</td>
              <td>${item.quantity}</td>
              <td>₹${item.unitPrice.toLocaleString()}</td>
              <td>₹${baseAmount.toLocaleString()}</td>
              <td>${discount > 0 ? `₹${discount.toLocaleString()}` : '-'}</td>
              <td>₹${taxableValue.toLocaleString()}</td>
              <td>${item.taxRate}%</td>
              <td>₹${item.taxAmount.toLocaleString()}</td>
              <td>₹${item.total.toLocaleString()}</td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
      
      <!-- GST Summary by Rate -->
      ${data.gstData?.gstBreakup && Object.keys(data.gstData.gstBreakup).length > 0 ? `
        <div class="summary" style="margin-bottom: 15px;">
          <div style="text-align: left; font-weight: bold; margin-bottom: 10px;">GST Summary:</div>
          ${Object.entries(data.gstData.gstBreakup).map(([rate, gstData]) => {
            const rateNum = parseFloat(rate);
            if (data.gstData?.isIntraState) {
              const cgstAmount = gstData.taxAmount / 2;
              const sgstAmount = gstData.taxAmount / 2;
              return `
                <div class="summary-row" style="font-size: 11px; margin-bottom: 5px;">
                  <span><strong>GST @ ${rate}%:</strong> Taxable ₹${gstData.taxableAmount.toLocaleString()} | Tax ₹${gstData.taxAmount.toLocaleString()}</span>
                </div>
                <div class="summary-row" style="font-size: 10px; padding-left: 20px; color: #666;">
                  <span>CGST @ ${rateNum / 2}%: ₹${cgstAmount.toLocaleString()} | SGST @ ${rateNum / 2}%: ₹${sgstAmount.toLocaleString()}</span>
                </div>
              `;
            } else {
              return `
                <div class="summary-row" style="font-size: 11px;">
                  <span><strong>GST @ ${rate}%:</strong> Taxable ₹${gstData.taxableAmount.toLocaleString()} | IGST @ ${rate}%: ₹${gstData.taxAmount.toLocaleString()}</span>
                </div>
              `;
            }
          }).join('')}
        </div>
      ` : ''}
      
      <!-- Summary -->
      <div class="summary">
        ${(data as any).invoiceDetails?.totalDiscount && (data as any).invoiceDetails.totalDiscount > 0 ? `
          <div class="summary-row">
            <span>Subtotal (Base Amount):</span>
            <span>₹${(data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)).toLocaleString()}</span>
          </div>
          <div class="summary-row" style="color: #dc2626;">
            <span>Total Discount:</span>
            <span>-₹${(data as any).invoiceDetails.totalDiscount.toLocaleString()}</span>
          </div>
        ` : ''}
        <div class="summary-row" style="${(data as any).invoiceDetails?.totalDiscount > 0 ? 'font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 8px;' : ''}">
          <span>Total Taxable Value:</span>
          <span>₹${data.subtotal.toLocaleString()}</span>
        </div>
        ${data.gstData?.isIntraState ? `
          <div class="summary-row">
            <span>Total CGST:</span>
            <span>₹${data.gstData.taxSplit?.cgst.toLocaleString() || '0'}</span>
          </div>
          <div class="summary-row">
            <span>Total SGST:</span>
            <span>₹${data.gstData.taxSplit?.sgst.toLocaleString() || '0'}</span>
          </div>
        ` : `
          <div class="summary-row">
            <span>Total IGST:</span>
            <span>₹${data.gstData?.taxSplit?.igst.toLocaleString() || data.totalTax.toLocaleString()}</span>
          </div>
        `}
        <div class="summary-row" style="font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          <span>Total GST:</span>
          <span>₹${data.totalTax.toLocaleString()}</span>
        </div>
        ${data.serviceCharge && data.serviceCharge > 0 ? `
          <div class="summary-row">
            <span>Service Charge:</span>
            <span>₹${data.serviceCharge.toLocaleString()}</span>
          </div>
        ` : ''}
        ${data.gstData?.roundOff !== undefined && data.gstData.roundOff !== 0 ? `
          <div class="summary-row" style="font-size: 11px;">
            <span>Round Off:</span>
            <span>₹${data.gstData.roundOff.toLocaleString()}</span>
          </div>
        ` : ''}
        <div class="summary-row total">
          <span>Grand Total (Invoice Value):</span>
          <span>₹${data.totalAmount.toLocaleString()}</span>
        </div>
        <div class="summary-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 13px; font-weight: bold;">
          <span>Amount in Words:</span>
          <span style="text-transform: capitalize;">${numberToWords(data.totalAmount)}</span>
        </div>
      </div>
      
      <!-- Notes and Terms -->
      ${data.notes || data.terms ? `
        <div class="notes-section">
          ${data.notes ? `
            <div class="notes-title">Additional Info:</div>
              <div class="notes-content">${sanitizeForTemplate(data.notes)}</div>
          ` : ''}
          ${data.terms ? `
            <div class="notes-title" style="margin-top: 20px;">Terms & Conditions:</div>
            <div class="notes-content">
              <ul class="terms-list">
                ${data.terms.split('\n').filter(line => line.trim()).map(term => {
                  const cleanTerm = term.replace(/^\d+\.\s*/, '');
                  return `<li>${cleanTerm}</li>`;
                }).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <!-- Signatures -->
      <div class="signatures">
        <div class="signature-box">
          <div class="signature-label" style="text-align: center;">Authorized Signatory</div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px; text-align: center;">M/s Hydrogen RO</div>
          <img src="/HydrogenROSeal.webp" alt="Hydrogen RO Seal" class="signature-seal" />
          <div class="signature-date" style="text-align: center;">Date: ${new Date().toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          })}</div>
        </div>
      </div>
      
      <!-- Bank Details -->
      ${data.bankDetails ? `
        <div class="notes-section">
          <div class="notes-title">Bank Details:</div>
          <div class="notes-content" style="font-size: 13px; line-height: 1.8;">
            <div><strong>Bank Name:</strong> ${data.bankDetails.bankName || ''}</div>
            <div><strong>Account Number:</strong> ${data.bankDetails.accountNumber || ''}</div>
            <div><strong>IFSC Code:</strong> ${data.bankDetails.ifscCode || ''}</div>
            <div><strong>Branch:</strong> ${data.bankDetails.branchName || ''}</div>
            <div><strong>Account Holder:</strong> ${data.bankDetails.accountHolderName || ''}</div>
          </div>
        </div>
      ` : ''}
      
      <!-- Computer Generated Disclaimer -->
      <div style="margin-top: 30px; padding: 15px 10px; text-align: justify; font-size: 11px; color: #4b5563; border-top: 2px solid #e5e7eb; background-color: #f9fafb;">
        <p style="margin: 8px 0; font-weight: 600; letter-spacing: normal; word-spacing: normal; text-align: justify; line-height: 1.6;">This is a Computer Generated Invoice. No signature is required. This invoice is valid and legally binding.</p>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p>Thank you for choosing Hydrogenro!</p>
        <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
      </div>
    </div>
  `;
}

function generateTaxInvoiceHTML(data: PDFTaxInvoiceData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tax Invoice - ${data.billNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Poppins', sans-serif;
          line-height: 1.4;
          color: #333;
          background: white;
          margin: 0;
          padding: 15mm;
          font-size: 11px;
        }
        
        .bill-container {
          width: 100%;
          max-width: 100%;
          margin: 0;
          background: white;
          padding: 0;
          border: 2px solid #000;
          box-sizing: border-box;
        }
        
        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #000000;
          padding: 5px 0 8px 0;
        }
        
        .logo-container {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 15px;
        }
        
        .full-logo {
          max-width: 200px;
          height: auto;
          max-height: 60px;
        }
        
        .company-details {
          font-size: 14px;
          color: #666;
          line-height: 1.4;
        }
        
        .bill-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
          gap: 15px;
          padding: 0 5px;
        }
        
        .bill-to, .bill-details {
          flex: 1;
        }
        
        .section-title {
          font-size: 18px;
          font-weight: bold;
          color: #000000;
          margin-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 5px;
        }
        
        .customer-info, .bill-meta {
          font-size: 14px;
          line-height: 1.5;
        }
        
        .items-table {
          width: calc(100% - 30px);
          border-collapse: collapse;
          margin: 0 15px 15px 15px;
          font-size: 9px;
          table-layout: fixed;
        }
        
        .items-table th {
          background-color: #f8fafc;
          color: #374151;
          font-weight: bold;
          padding: 8px 4px;
          text-align: center;
          border: 1px solid #d1d5db;
        }
        
        .items-table th:nth-child(1) { width: 20%; }
        .items-table th:nth-child(2) { width: 7%; }
        .items-table th:nth-child(3) { width: 7%; }
        .items-table th:nth-child(4) { width: 10%; }
        .items-table th:nth-child(5) { width: 10%; }
        .items-table th:nth-child(6) { width: 8%; }
        .items-table th:nth-child(7) { width: 10%; }
        .items-table th:nth-child(8) { width: 6%; }
        .items-table th:nth-child(9) { width: 10%; }
        .items-table th:nth-child(10) { width: 12%; }
        
        .items-table td {
          padding: 8px 4px;
          border: 1px solid #d1d5db;
          vertical-align: middle;
          text-align: center;
          word-wrap: break-word;
          overflow: hidden;
        }
        
        .items-table tr:nth-child(even) {
          background-color: #f9fafb;
        }
        
        .summary {
          margin: 15px 15px 0 15px;
          text-align: right;
          width: calc(100% - 30px);
          box-sizing: border-box;
        }
        
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .summary-row.total {
          font-size: 18px;
          font-weight: bold;
          color: #000000;
          border-top: 2px solid #000000;
          border-bottom: 2px solid #000000;
          margin-top: 10px;
          padding: 5px 0;
        }
        
        .notes-section {
          margin: 15px 5px 0 5px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
        }
        
        .notes-title {
          font-size: 16px;
          font-weight: bold;
          color: #374151;
          margin-bottom: 10px;
        }
        
        .notes-content {
          font-size: 14px;
          line-height: 1.5;
          color: #6b7280;
        }
        
        .terms-list {
          margin: 0;
          padding-left: 5px;
        }
        
        .terms-list li {
          margin-bottom: 8px;
          list-style-type: disc;
        }
        
        .signatures {
          display: flex;
          justify-content: center;
          margin: 30px 15px 20px 15px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
        
        .signature-box {
          text-align: center;
          padding-top: 15px;
        }
        
        .signature-label {
          font-weight: bold;
          color: #000000;
          margin-bottom: 5px;
          font-size: 14px;
        }
        
        .signature-seal {
          width: 120px;
          height: 120px;
          margin: 20px auto 10px auto;
          display: block;
        }
        
        .signature-date {
          font-size: 12px;
          color: #6b7280;
        }
        
        .footer {
          margin: 15px 15px 0 15px;
          padding: 10px 0;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 10px;
          color: #6b7280;
        }
        
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          body {
            margin: 0 !important;
            padding: 15mm !important;
            font-size: 12pt !important;
            line-height: 1.4 !important;
          }
          
          .bill-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px 1px 20px 1px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            box-sizing: border-box !important;
            border-radius: 0 !important;
          }
          
          @page {
            size: A4 !important;
            margin: 20mm 8mm 20mm 8mm !important;
            border: 2px solid #000000 !important;
            border-radius: 12px !important;
          }
        }
      </style>
    </head>
    <body>
      ${createTaxInvoiceContent(data)}
    </body>
    </html>
  `;
}

