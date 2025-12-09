// PDF Generation utility for Vendor Invoice Tracker (VIT)
// Matches the exact design layout, fonts, spacing, border style, table formatting, footer style, and visual structure as the Hydrogen RO invoice PDF

import { sanitizeForTemplate } from './sanitize';

export interface VendorInvoicePDFData {
  invoiceNumber: string;
  invoiceDate: string;
  company: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber: string;
    website?: string;
  };
  vendor: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber?: string;
  };
  referenceDetails: {
    referenceNumber?: string;
    referenceDate?: string;
    poNumber?: string;
    poDate?: string;
    [key: string]: string | undefined;
  };
  items: Array<{
    description: string;
    quantity: number;
    taxableValue: number;
    gstAmount: number;
    totalValue: number;
    serviceDate: string;
  }>;
  bankDetails?: {
    accountHolderName?: string;
    bankName?: string;
    branchName?: string;
    accountType?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
    note?: string;
  };
  declaration?: string;
}

// Global flag to prevent multiple print operations
let isPrinting = false;

export function generateVendorInvoicePDF(data: VendorInvoicePDFData, action: 'print' | 'pdf' = 'print'): void {
  // Prevent multiple print operations
  if (isPrinting) {
    console.warn('Print operation already in progress');
    return;
  }
  
  isPrinting = true;
  
  try {
    // Check if it's a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // For mobile devices, use a different approach
      handleMobilePrint(data, action);
      return;
    }
    
    // Create a new window for printing to avoid destroying React components
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Please allow popups to print the vendor invoice');
      return;
    }
    
    // Create the vendor invoice content
    const invoiceContent = createVendorInvoiceContent(data);
    
    // Write content to new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vendor Invoice - ${data.invoiceNumber}</title>
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
          
          .invoice-container {
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
          
          .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            gap: 15px;
            padding: 0 5px;
          }
          
          .bill-to, .reference-details {
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
          
          .vendor-info, .reference-meta {
            font-size: 14px;
            line-height: 1.5;
          }
          
          .items-table {
            width: calc(100% - 30px);
            border-collapse: collapse;
            margin: 0 15px 15px 15px;
            font-size: 10px;
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
          
          .items-table th:nth-child(1) { width: 30%; }
          .items-table th:nth-child(2) { width: 10%; }
          .items-table th:nth-child(3) { width: 15%; }
          .items-table th:nth-child(4) { width: 15%; }
          .items-table th:nth-child(5) { width: 15%; }
          .items-table th:nth-child(6) { width: 15%; }
          
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
          
          .bank-section {
            margin: 15px 15px 0 15px;
            padding: 10px 12px;
            border: 1px dashed #047857;
            border-radius: 8px;
            background: #ecfdf5;
          }
          
          .bank-title {
            font-size: 14px;
            font-weight: 600;
            color: #065f46;
            margin-bottom: 6px;
          }
          
          .bank-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
          }
          
          .bank-item {
            font-size: 12px;
            line-height: 1.4;
          }
          
          .bank-label {
            font-weight: 600;
            color: #064e3b;
            display: block;
          }
          
          .bank-value {
            color: #065f46;
            word-break: break-word;
          }
          
          .bank-note {
            margin-top: 8px;
            font-size: 11px;
            color: #064e3b;
            font-style: italic;
          }
          
          .declaration-section {
            margin: 15px 15px 0 15px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
          }
          
          .declaration-title {
            font-size: 16px;
            font-weight: bold;
            color: #374151;
            margin-bottom: 10px;
          }
          
          .declaration-content {
            font-size: 14px;
            line-height: 1.5;
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
            
            .invoice-container {
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
    setTimeout(() => {
      printWindow.print();
      isPrinting = false;
    }, 500);
    
  } catch (error) {
    console.error('Error generating vendor invoice PDF:', error);
    alert('Error generating vendor invoice. Please try again.');
    isPrinting = false;
  }
}

function handleMobilePrint(data: VendorInvoicePDFData, action: 'print' | 'pdf'): void {
  try {
    // Create a temporary container for the invoice
    const tempContainer = document.createElement('div');
    tempContainer.id = 'vendor-invoice-print-container';
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '210mm';
    tempContainer.style.background = 'white';
    tempContainer.style.zIndex = '9999';
    
    const invoiceContent = createVendorInvoiceContent(data);
    tempContainer.innerHTML = invoiceContent;
    
    document.body.appendChild(tempContainer);
    
    // Add print styles
    const printStyles = document.createElement('style');
    printStyles.id = 'vendor-invoice-print-styles';
    printStyles.textContent = `
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
        padding: 0;
        font-size: 12px;
        -webkit-text-size-adjust: 100%;
      }
      
      #vendor-invoice-print-container {
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        background: white;
        padding: 15px 10px;
        border: 2px solid #000;
        box-sizing: border-box;
        border-radius: 12px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
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
      
      .invoice-info {
        display: flex;
        flex-direction: column;
        margin-bottom: 15px;
        gap: 15px;
        padding: 0;
        width: 100%;
        box-sizing: border-box;
      }
      
      .bill-to, .reference-details {
        width: 100%;
        flex: 1;
        box-sizing: border-box;
      }
      
      .section-title {
        font-size: 18px;
        font-weight: bold;
        color: #000000;
        margin-bottom: 15px;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 5px;
      }
      
      .vendor-info, .reference-meta {
        font-size: 14px;
        line-height: 1.5;
      }
      
      .items-table {
        width: 100%;
        max-width: 100%;
        border-collapse: collapse;
        margin: 0 0 15px 0;
        font-size: 9px;
        table-layout: fixed;
        box-sizing: border-box;
      }
      
      .items-table th {
        background-color: #f8fafc;
        color: #374151;
        font-weight: bold;
        padding: 6px 3px;
        text-align: center;
        border: 1px solid #d1d5db;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      .items-table th:nth-child(1) { width: 30%; }
      .items-table th:nth-child(2) { width: 10%; }
      .items-table th:nth-child(3) { width: 15%; }
      .items-table th:nth-child(4) { width: 15%; }
      .items-table th:nth-child(5) { width: 15%; }
      .items-table th:nth-child(6) { width: 15%; }
      
      .items-table td {
        padding: 6px 3px;
        border: 1px solid #d1d5db;
        vertical-align: middle;
        text-align: center;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .items-table tr:nth-child(even) {
        background-color: #f9fafb;
      }
      
      .bank-section {
        margin: 15px 0 0 0;
        padding: 10px 12px;
        border: 1px dashed #047857;
        border-radius: 8px;
        background: #ecfdf5;
        width: 100%;
        box-sizing: border-box;
      }
      
      .bank-title {
        font-size: 14px;
        font-weight: 600;
        color: #065f46;
        margin-bottom: 6px;
      }
      
      .bank-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      
      .bank-item {
        font-size: 12px;
        line-height: 1.4;
      }
      
      .bank-label {
        font-weight: 600;
        color: #064e3b;
        display: block;
      }
      
      .bank-value {
        color: #065f46;
        word-break: break-word;
      }
      
      .bank-note {
        margin-top: 8px;
        font-size: 11px;
        color: #064e3b;
        font-style: italic;
      }
      
      .declaration-section {
        margin: 15px 0 0 0;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
        width: 100%;
        box-sizing: border-box;
      }
      
      .declaration-title {
        font-size: 16px;
        font-weight: bold;
        color: #374151;
        margin-bottom: 10px;
      }
      
      .declaration-content {
        font-size: 14px;
        line-height: 1.5;
        color: #6b7280;
      }
      
      .footer {
        margin: 15px 0 0 0;
        padding: 10px 0;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        font-size: 10px;
        color: #6b7280;
        width: 100%;
        box-sizing: border-box;
      }
      
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        body {
          margin: 0 !important;
          padding: 0 !important;
          font-size: 12pt !important;
          line-height: 1.4 !important;
        }
        
        #vendor-invoice-print-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 15px 10px !important;
          border: 2px solid #000 !important;
          box-shadow: none !important;
          background: white !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        @page {
          size: A4 !important;
          margin: 20mm 8mm 20mm 8mm !important;
          border: 2px solid #000000 !important;
          border-radius: 12px !important;
        }
        
        @page :first {
          size: A4 !important;
          margin: 20mm 8mm 20mm 8mm !important;
          border: 2px solid #000000 !important;
          border-radius: 12px !important;
        }
      }
    `;
    
    document.head.appendChild(printStyles);
    
    const cleanup = () => {
      if (tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      const styles = document.getElementById('vendor-invoice-print-styles');
      if (styles) {
        styles.remove();
      }
      isPrinting = false;
    };
    
    window.addEventListener('afterprint', cleanup);
    
    const images = tempContainer.querySelectorAll('img');
    let imagesLoaded = 0;
    const totalImages = images.length;
    
    const triggerPrint = () => {
      setTimeout(() => {
        try {
          window.print();
          setTimeout(() => {
            if (isPrinting) {
              cleanup();
            }
          }, 8000);
        } catch (printError) {
          console.error('Error during print:', printError);
          alert('Error generating PDF. Please try again.');
          cleanup();
        }
      }, 500);
    };
    
    if (totalImages === 0) {
      triggerPrint();
    } else {
      const checkAndPrint = () => {
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          triggerPrint();
        }
      };
      
      images.forEach((img) => {
        if ((img as HTMLImageElement).complete) {
          checkAndPrint();
        } else {
          img.onload = checkAndPrint;
          img.onerror = checkAndPrint;
        }
      });
      
      setTimeout(() => {
        if (isPrinting) {
          triggerPrint();
        }
      }, 3000);
    }
    
  } catch (error) {
    console.error('Error generating mobile vendor invoice PDF:', error);
    alert('Error generating vendor invoice. Please try again.');
    isPrinting = false;
  }
}

function createVendorInvoiceContent(data: VendorInvoicePDFData): string {
  const totalTaxableValue = data.items.reduce((sum, item) => sum + item.taxableValue, 0);
  const totalGstAmount = data.items.reduce((sum, item) => sum + item.gstAmount, 0);
  const totalValue = data.items.reduce((sum, item) => sum + item.totalValue, 0);
  
  return `
    <div class="invoice-container">
      <!-- Header -->
      <div class="header">
        <div class="logo-container">
          <img src="/fulllogo.webp" alt="Hydrogenro Logo" class="full-logo" />
        </div>
        <div class="company-details">
          <div>${data.company.address}, ${data.company.city} - ${data.company.pincode}</div>
          <div>Phone: ${data.company.phone} | Email: ${data.company.email}</div>
          <div>GST: ${data.company.gstNumber}</div>
          ${data.company.website ? `<div>Website: ${data.company.website}</div>` : ''}
        </div>
      </div>
      
      <!-- Invoice Information -->
      <div class="invoice-info">
        <div class="bill-to">
          <div class="section-title">Bill To:</div>
          <div class="vendor-info">
            <div><strong>${sanitizeForTemplate(data.vendor.name)}</strong></div>
            ${data.vendor.address ? `<div>${sanitizeForTemplate(data.vendor.address)}</div>` : ''}
            ${(data.vendor.city || data.vendor.state || data.vendor.pincode) ? `<div>${data.vendor.city}, ${data.vendor.state} - ${data.vendor.pincode}</div>` : ''}
            ${data.vendor.phone ? `<div>Phone: ${data.vendor.phone}</div>` : ''}
            ${data.vendor.email ? `<div>Email: ${data.vendor.email}</div>` : ''}
            ${data.vendor.gstNumber ? `<div>GST: ${data.vendor.gstNumber}</div>` : ''}
          </div>
        </div>
        
        <div class="reference-details">
          <div class="section-title">Reference Details:</div>
          <div class="reference-meta">
            <div><strong>Invoice Number:</strong> ${data.invoiceNumber}</div>
            <div><strong>Invoice Date:</strong> ${new Date(data.invoiceDate).toLocaleDateString('en-IN')}</div>
            ${data.referenceDetails.referenceNumber ? `<div><strong>Reference Number:</strong> ${data.referenceDetails.referenceNumber}</div>` : ''}
            ${data.referenceDetails.referenceDate ? `<div><strong>Reference Date:</strong> ${new Date(data.referenceDetails.referenceDate).toLocaleDateString('en-IN')}</div>` : ''}
            ${data.referenceDetails.poNumber ? `<div><strong>PO Number:</strong> ${data.referenceDetails.poNumber}</div>` : ''}
            ${data.referenceDetails.poDate ? `<div><strong>PO Date:</strong> ${new Date(data.referenceDetails.poDate).toLocaleDateString('en-IN')}</div>` : ''}
            ${Object.entries(data.referenceDetails).filter(([key]) => !['referenceNumber', 'referenceDate', 'poNumber', 'poDate'].includes(key)).map(([key, value]) => 
              value ? `<div><strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> ${value}</div>` : ''
            ).join('')}
          </div>
        </div>
      </div>
      
      <!-- Invoice Tracking Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Taxable Value</th>
            <th>GST Amount</th>
            <th>Total Value</th>
            <th>Service Date</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${sanitizeForTemplate(item.description)}</td>
              <td>${item.quantity}</td>
              <td>₹${item.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>₹${item.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>₹${item.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>${new Date(item.serviceDate).toLocaleDateString('en-IN')}</td>
            </tr>
          `).join('')}
          <tr style="font-weight: bold; background-color: #f3f4f6;">
            <td colspan="2">Total</td>
            <td>₹${totalTaxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>₹${totalGstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      
      <!-- Payment Details -->
      ${data.bankDetails ? `
        <div class="bank-section">
          <div class="bank-title">Payment Details</div>
          <div class="bank-grid">
            ${data.bankDetails.accountHolderName ? `
              <div class="bank-item">
                <span class="bank-label">Account Holder</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.accountHolderName)}</span>
              </div>` : ''}
            ${data.bankDetails.bankName ? `
              <div class="bank-item">
                <span class="bank-label">Bank Name</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.bankName)}</span>
              </div>` : ''}
            ${data.bankDetails.branchName ? `
              <div class="bank-item">
                <span class="bank-label">Branch</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.branchName)}</span>
              </div>` : ''}
            ${data.bankDetails.accountType ? `
              <div class="bank-item">
                <span class="bank-label">Account Type</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.accountType)}</span>
              </div>` : ''}
            ${data.bankDetails.accountNumber ? `
              <div class="bank-item">
                <span class="bank-label">Account Number</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.accountNumber)}</span>
              </div>` : ''}
            ${data.bankDetails.ifscCode ? `
              <div class="bank-item">
                <span class="bank-label">IFSC Code</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.ifscCode)}</span>
              </div>` : ''}
            ${data.bankDetails.upiId ? `
              <div class="bank-item">
                <span class="bank-label">UPI ID</span>
                <span class="bank-value">${sanitizeForTemplate(data.bankDetails.upiId)}</span>
              </div>` : ''}
          </div>
          ${data.bankDetails.note ? `<div class="bank-note">${sanitizeForTemplate(data.bankDetails.note)}</div>` : ''}
        </div>
      ` : ''}
      
      <!-- Declaration Section -->
      ${data.declaration ? `
        <div class="declaration-section">
          <div class="declaration-title">Declaration</div>
          <div class="declaration-content">
            ${sanitizeForTemplate(data.declaration).replace(/\n/g, '<br />')}
          </div>
        </div>
      ` : ''}
      
      <!-- Footer -->
      <div class="footer">
        <p>This is a computer-generated document and does not require a signature.</p>
        <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
      </div>
    </div>
  `;
}

