// PDF Generation utility for quotations
// This is a simple implementation using browser's print functionality
// For production, consider using libraries like jsPDF or Puppeteer

import { sanitizeForTemplate } from './sanitize';

export interface PDFQuotationData {
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
  }>;
  subtotal: number;
  serviceCharge?: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string;
  notes?: string;
  terms?: string;
  bankDetails?: {
    accountHolderName?: string;
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
    note?: string;
  };
}

export function generateQuotationPDF(quotationData: PDFQuotationData, action: 'print' | 'pdf' = 'print'): void {
  try {
    // Check if it's a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // For mobile devices, use a different approach
      handleMobilePrint(quotationData, action);
      return;
    }
    
    // Create a new window for printing to avoid destroying React components
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Please allow popups to print the quotation');
      return;
    }
    
    // Create the quotation content
    const quotationContent = createQuotationContent(quotationData);
    console.log('Quotation content generated:', quotationContent.substring(0, 200) + '...');
    
    // Write content to new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quotation - ${quotationData.billNumber}</title>
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
            padding: 12mm 8mm;
            font-size: 11px;
        }
      
          .quotation-container {
            width: 100%;
            max-width: 100%;
            margin: 0;
            background: white;
            padding: 0;
            box-sizing: border-box;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
          }
          
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 2px solid #000000;
            padding: 10px 0 8px 0;
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
          
          .quotation-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            gap: 15px;
            padding: 0 15px;
          }
          
          .quotation-to, .quotation-details {
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
          
          .customer-info, .quotation-meta {
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
          
          .items-table th:nth-child(1) { width: 50%; }
          .items-table th:nth-child(2) { width: 15%; }
          .items-table th:nth-child(3) { width: 20%; }
          .items-table th:nth-child(4) { width: 15%; }
          
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
            page-break-inside: avoid;
            break-inside: avoid;
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
            padding: 15px 0;
          }
          
          .notes-section {
            margin: 15px 15px 0 15px;
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
          
          .bank-section {
            margin: 15px 15px 0 15px;
            padding: 12px 15px;
            border: 1px dashed #047857;
            border-radius: 8px;
            background: #ecfdf5;
          }
          
          .bank-title {
            font-size: 16px;
            font-weight: 600;
            color: #065f46;
            margin-bottom: 8px;
          }
          
          .bank-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
          }
          
          .bank-item {
            font-size: 13px;
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
            margin-top: 10px;
            font-size: 12px;
            color: #064e3b;
            font-style: italic;
          }
          
          .validity-note {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 15px;
            margin: 15px 15px 20px 15px;
            font-size: 14px;
            color: #374151;
            font-weight: 500;
          }
          
          .validity-note strong {
            color: #111827;
            font-weight: 700;
          }
          
          .gst-note {
            margin: 0 15px 15px 15px;
            background: #ecfdf5;
            border-left: 4px solid #047857;
            padding: 10px 12px;
            font-size: 12px;
            color: #065f46;
            line-height: 1.5;
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
              padding: 12mm 8mm !important;
              font-size: 12pt !important;
              line-height: 1.4 !important;
        }
        
        .quotation-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
              box-shadow: none !important;
              background: white !important;
              box-sizing: border-box !important;
            }
            
            @page {
              size: A4 !important;
              margin: 12mm 8mm !important;
              border: 2px solid #000000 !important;
              border-radius: 10px !important;
            }
          }
        </style>
      </head>
      <body>
        ${quotationContent}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        if (action === 'print') {
          // Direct print without preview
          printWindow.print();
        } else {
          // Save as PDF (browser will show save dialog)
          printWindow.print();
        }
        
        // Close the print window after printing
    setTimeout(() => {
          printWindow.close();
    }, 1000);
      }, 100);
    };
    
  } catch (error) {
    console.error('Error generating quotation PDF:', error);
    alert('Error generating quotation. Please try again.');
  }
}

function handleMobilePrint(quotationData: PDFQuotationData, action: 'print' | 'pdf'): void {
  // Store original content for restoration
  const originalBody = document.body.innerHTML;
  const originalTitle = document.title;
  
  // Store references to cleanup
  let afterPrintHandler: (() => void) | null = null;
  let isPrinting = true;
  
  const cleanup = () => {
    try {
      // Remove print event listener
      if (afterPrintHandler) {
        window.removeEventListener('afterprint', afterPrintHandler);
      }
      
      // Only cleanup if still printing (prevent duplicate cleanups)
      if (!isPrinting) {
        return;
      }
      
      // Mark as no longer printing to prevent duplicate cleanup
      isPrinting = false;
      
      // Remove injected styles
      const printStyles = document.getElementById('mobile-print-styles');
      if (printStyles && printStyles.parentNode) {
        printStyles.parentNode.removeChild(printStyles);
      }
      
      // Restore original title
      document.title = originalTitle;
      
      // Restore original body HTML
      document.body.innerHTML = originalBody;
      
      // Force page reload to fully restore React state
      // This is the most reliable way on mobile
      // Use a small delay before reload to ensure print is fully processed
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      isPrinting = false;
      // If cleanup fails, reload the page
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };
  
  try {
    // Create the quotation content
    const quotationContent = createQuotationContent(quotationData);
    console.log('Mobile quotation content generated:', quotationContent.substring(0, 200) + '...');
    
    // COMPLETELY REPLACE body HTML with quotation document content (like desktop does with new window)
    // This ensures ONLY the quotation content is visible when print dialog opens
    document.body.innerHTML = quotationContent;
    document.title = `Quotation - ${quotationData.billNumber}`;
    
    // Add mobile-optimized print styles
    const printStyles = document.createElement('style');
    printStyles.id = 'mobile-print-styles';
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
        padding: 8mm;
        font-size: 10px;
        -webkit-text-size-adjust: 100%;
      }
      
      .quotation-container {
        width: 100%;
        max-width: 100%;
        margin: 0;
        background: white;
        padding: 0;
        box-sizing: border-box;
      }
      
      .header {
        text-align: center;
        margin-bottom: 10px;
        border-bottom: 2px solid #000000;
        padding: 8px 0 6px 0;
      }
      
      .logo-container {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 10px;
      }
      
      .full-logo {
        max-width: 150px;
        height: auto;
        max-height: 50px;
      }
      
      .company-details {
        font-size: 12px;
        color: #666;
        line-height: 1.3;
      }
      
      .quotation-info {
        display: flex;
        flex-direction: column;
        margin-bottom: 10px;
        gap: 10px;
        padding: 0 10px;
      }
      
      .quotation-to, .quotation-details {
        flex: 1;
      }
      
      .section-title {
        font-size: 16px;
        font-weight: bold;
        color: #000000;
        margin-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 3px;
      }
      
      .customer-info, .quotation-meta {
        font-size: 12px;
        line-height: 1.4;
      }
      
      .items-table {
        width: calc(100% - 20px);
        border-collapse: collapse;
        margin: 0 10px 10px 10px;
        font-size: 9px;
        table-layout: fixed;
      }
      
      .items-table th {
        background-color: #f8fafc;
        color: #374151;
        font-weight: bold;
        padding: 6px 3px;
        text-align: center;
        border: 1px solid #d1d5db;
      }
      
      .items-table th:nth-child(1) { width: 50%; }
      .items-table th:nth-child(2) { width: 15%; }
      .items-table th:nth-child(3) { width: 20%; }
      .items-table th:nth-child(4) { width: 15%; }
      
      .items-table td {
        padding: 6px 3px;
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
        margin: 10px 10px 0 10px;
        text-align: right;
        width: calc(100% - 20px);
        box-sizing: border-box;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      
      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .summary-row.total {
        font-size: 16px;
        font-weight: bold;
        color: #000000;
        border-top: 2px solid #000000;
        border-bottom: 2px solid #000000;
        margin-top: 8px;
        padding: 12px 0;
      }
      
      .notes-section {
        margin: 10px 10px 0 10px;
        padding-top: 8px;
        border-top: 1px solid #e5e7eb;
      }
      
      .notes-title {
        font-size: 14px;
        font-weight: bold;
        color: #374151;
        margin-bottom: 8px;
      }
      
      .notes-content {
        font-size: 12px;
        line-height: 1.4;
        color: #6b7280;
      }
      
      .bank-section {
        margin: 10px 10px 0 10px;
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
      
      .validity-note {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 12px;
        margin: 10px 10px 15px 10px;
        font-size: 12px;
        color: #374151;
        font-weight: 500;
      }
      
      .validity-note strong {
        color: #111827;
        font-weight: 700;
      }
      
      .gst-note {
        margin: 0 10px 12px 10px;
        background: #ecfdf5;
        border-left: 3px solid #047857;
        padding: 8px 10px;
        font-size: 11px;
        color: #065f46;
        line-height: 1.4;
      }
      
      .footer {
        margin: 10px 10px 0 10px;
        padding: 8px 0;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        font-size: 9px;
        color: #6b7280;
      }
      
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        body {
          margin: 0 !important;
          padding: 8mm !important;
          font-size: 11pt !important;
          line-height: 1.4 !important;
        }
        
        .quotation-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          background: white !important;
          box-sizing: border-box !important;
        }
        
        @page {
          size: A4 !important;
          margin: 12mm 8mm !important;
          border: 2px solid #000000 !important;
          border-radius: 10px !important;
        }
      }
    `;
    
    // Add styles to document
    document.head.appendChild(printStyles);
    
    // Force a reflow to ensure content is rendered
    void document.body.offsetHeight;
    
    // Set up print event handlers
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
    
    afterPrintHandler = () => {
      // Wait much longer before cleanup to ensure print is fully captured
      // Mobile browsers may still be processing the print after dialog closes
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      // Increased delay to 3 seconds - ensures print is captured before cleanup
      cleanupTimeout = setTimeout(cleanup, 3000);
    };
    
    window.addEventListener('afterprint', afterPrintHandler);
    
    // Wait for content to fully render, including images
    const images = document.body.querySelectorAll('img');
    let imagesLoaded = 0;
    const totalImages = images.length;
    
    const triggerPrint = () => {
      // Small delay to ensure everything is rendered
      setTimeout(() => {
        try {
          if (action === 'print') {
            // Direct print without preview
            window.print();
          } else {
            // Save as PDF (browser will show save dialog)
            window.print();
          }
          
          // Fallback cleanup in case afterprint doesn't fire (some mobile browsers)
          // Use longer delay - 8 seconds to ensure print is fully captured
          setTimeout(() => {
            if (isPrinting) {
              cleanup();
            }
          }, 8000); // 8 second fallback - ensures print completes before cleanup
        } catch (printError) {
          console.error('Error during print:', printError);
          alert('Error generating PDF. Please try again.');
          cleanup();
        }
      }, 500); // Give time for fonts and styles to load
    };
    
    if (totalImages === 0) {
      // No images, proceed immediately
      triggerPrint();
    } else {
      // Wait for images to load
      const checkAndPrint = () => {
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          // All images loaded, trigger print
          triggerPrint();
        }
      };
      
      images.forEach((img) => {
        if (img.complete) {
          checkAndPrint();
        } else {
          img.onload = checkAndPrint;
          img.onerror = checkAndPrint; // Proceed even if image fails
        }
      });
      
      // Fallback: proceed after max 3 seconds even if images don't load
      setTimeout(() => {
        if (isPrinting) {
          triggerPrint();
        }
      }, 3000);
    
      // Additional safety: keep quotation content visible for at least 10 seconds
      // This ensures mobile browsers have time to capture the content
      setTimeout(() => {
        // Don't cleanup if already cleaned up
        if (isPrinting) {
          // This is just a safety net - cleanup should have happened by now
          console.log('Safety timeout reached - keeping quotation content visible');
        }
      }, 10000);
    }
    
  } catch (error) {
    console.error('Error generating mobile quotation PDF:', error);
    alert('Error generating quotation. Please try again.');
  }
}

function createQuotationContent(data: PDFQuotationData): string {
  const validityDate = new Date(new Date(data.billDate).getTime() + 30 * 24 * 60 * 60 * 1000);
  
  return `
    <div class="quotation-container">
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
      
      <!-- Quotation Information -->
      <div class="quotation-info">
        <div class="quotation-to">
          <div class="section-title">Quotation To:</div>
          <div class="customer-info">
            <div><strong>${sanitizeForTemplate(data.customer.name)}</strong></div>
            ${data.customer.address ? `<div>${sanitizeForTemplate(data.customer.address)}</div>` : ''}
            ${(data.customer.city || data.customer.state || data.customer.pincode) ? `<div>${data.customer.city}, ${data.customer.state} - ${data.customer.pincode}</div>` : ''}
            ${data.customer.phone ? `<div>Phone: ${data.customer.phone}</div>` : ''}
            ${data.customer.email ? `<div>Email: ${data.customer.email}</div>` : ''}
            ${data.customer.gstNumber ? `<div>GST: ${data.customer.gstNumber}</div>` : ''}
          </div>
        </div>
        
        <div class="quotation-details">
          <div class="section-title">Quotation Details:</div>
          <div class="quotation-meta">
            <div><strong>Quotation Number:</strong> ${data.billNumber}</div>
            <div><strong>Quotation Date:</strong> ${new Date(data.billDate).toLocaleDateString()}</div>
            <div><strong>Valid Until:</strong> ${validityDate.toLocaleDateString()}</div>
            ${(data as any).gstOption !== 'normal' && (data as any).gstData?.placeOfSupply ? `<div><strong>Place of Supply:</strong> ${(data as any).gstData.placeOfSupply} (State Code: ${(data as any).gstData.placeOfSupplyCode || '29'})</div>` : ''}
          </div>
        </div>
      </div>
      
      ${data.terms ? `
      <div class="validity-note">
        ${sanitizeForTemplate(data.terms).replace(/\n/g, '<br />')}
      </div>
      ` : ''}
      
      ${(data as any).gstOption === 'exclude' ? `
        <div class="gst-note">
          <strong>GST Note:</strong> GST not included in the above prices. Applicable GST will be charged separately if required.
        </div>
      ` : ''}
      
      ${((data as any).gstOption === 'include' && data.totalTax > 0) ? `
        <div class="gst-note">
          <strong>GST Note:</strong> Prices include GST.
          ${(data as any).gstData?.placeOfSupply ? `<br />Place of Supply: ${(data as any).gstData.placeOfSupply} (State Code: ${(data as any).gstData.placeOfSupplyCode || '29'})` : ''}
          ${(data as any).gstData?.isIntraState ? '<br />GST Type: Intra-state (CGST + SGST)' : ((data as any).gstData ? '<br />GST Type: Inter-state (IGST)' : '')}
        </div>
      ` : ''}
      
      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>₹${item.unitPrice.toLocaleString()}</td>
              <td>₹${item.total.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <!-- Summary -->
      <div class="summary">
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>₹${data.subtotal.toLocaleString()}</span>
        </div>
        ${data.serviceCharge && data.serviceCharge > 0 ? `
          <div class="summary-row">
            <span>Service Charge:</span>
            <span>₹${data.serviceCharge.toLocaleString()}</span>
          </div>
        ` : ''}
        ${(data as any).gstOption !== 'normal' && data.totalTax > 0 && (data as any).gstOption === 'include' && (data as any).gstData ? `
          ${(data as any).gstData.isIntraState ? `
            <div class="summary-row">
              <span>CGST (9%):</span>
              <span>₹${((data as any).gstData.taxSplit?.cgst || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div class="summary-row">
              <span>SGST (9%):</span>
              <span>₹${((data as any).gstData.taxSplit?.sgst || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          ` : `
            <div class="summary-row">
              <span>IGST (18%):</span>
              <span>₹${((data as any).gstData.taxSplit?.igst || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          `}
          <div class="summary-row" style="font-weight: 600; border-top: 1px solid #e5e7eb; padding-top: 5px;">
            <span>Total GST:</span>
            <span>₹${data.totalTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        ` : ''}
        <div class="summary-row total">
          <span>Total Amount ${(data as any).gstOption === 'normal' ? '' : (data as any).gstOption === 'exclude' ? '(Excl. GST)' : (data as any).gstOption === 'include' && data.totalTax > 0 ? '(Incl. GST)' : ''}:</span>
          <span>₹${data.totalAmount.toLocaleString()}</span>
        </div>
        ${(data as any).gstOption === 'exclude' ? `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 12px; font-style: italic;">
            * Note: GST not included. Applicable GST will be charged separately if applicable.
          </div>
        ` : ''}
      </div>
      
      <!-- Additional Info -->
      ${data.notes ? `
        <div class="notes-section">
          <div class="notes-title">Additional Info:</div>
          <div class="notes-content">${data.notes}</div>
        </div>
      ` : ''}
      
      ${data.bankDetails ? `
        <div class="bank-section">
          <div class="bank-title">Bank Details for Payment</div>
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
      
      <!-- Footer -->
      <div class="footer">
        <p>Thank you for considering our services!</p>
        <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
      </div>
    </div>
  `;
}

function generateQuotationHTML(data: PDFQuotationData): string {
  const validityDate = new Date(new Date(data.billDate).getTime() + 30 * 24 * 60 * 60 * 1000);
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Quotation - ${data.billNumber}</title>
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
          padding: 0;
          width: 210mm; /* A4 width */
          min-height: 297mm; /* A4 height */
          max-width: 210mm; /* Fixed A4 width */
        padding: 12mm 8mm 12mm 8mm; /* Reduced margins for more content space */
          box-sizing: border-box;
          overflow: visible;
          font-size: 11px; /* Smaller font for better fit */
        }
        
        .quotation-container {
          width: calc(100% - 4px); /* Account for border width */
          max-width: calc(100% - 4px);
          margin: 0;
          background: white;
          padding: 0;
          overflow: hidden;
          min-height: calc(297mm - 30mm); /* A4 height minus margins */
          box-sizing: border-box;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        
        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #000000;
          padding: 10px 0 8px 0;
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
        
        .quotation-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
          gap: 15px;
          padding: 0 15px;
        }
        
        .quotation-to, .quotation-details {
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
        
        .customer-info, .quotation-meta {
          font-size: 14px;
          line-height: 1.5;
        }
        
        .items-table {
          width: calc(100% - 30px); /* Account for left and right margins */
          border-collapse: collapse;
          margin: 0 15px 15px 15px;
          font-size: 10px;
          table-layout: fixed; /* Fixed table layout for better control */
        }
        
        .items-table th {
          background-color: #f8fafc;
          color: #374151;
          font-weight: bold;
          padding: 8px 4px;
          text-align: center;
          border: 1px solid #d1d5db;
        }
        
        .items-table th:nth-child(1) { width: 50%; } /* Description */
        .items-table th:nth-child(2) { width: 15%; } /* Qty */
        .items-table th:nth-child(3) { width: 20%; } /* Unit Price */
        .items-table th:nth-child(4) { width: 15%; } /* Total */
        
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
          padding: 15px 0;
        }
        
        .notes-section {
          margin: 15px 15px 0 15px;
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
        
        .validity-note {
          background-color: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 4px;
          padding: 15px;
          margin: 15px 15px 0 15px;
          font-size: 14px;
          color: #92400e;
        }
        
        .validity-note strong {
          color: #b45309;
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
            width: 210mm !important;
            min-height: 297mm !important;
            max-width: 210mm !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 12pt !important;
            line-height: 1.4 !important;
          }
          
          .quotation-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
          }
          
          @page {
            size: A4 !important;
            margin: 12mm 8mm !important;
            border: 2px solid #000000 !important;
            border-radius: 10px !important;
          }
          
          .header {
            page-break-after: avoid !important;
          }
          
          .items-table {
            page-break-inside: avoid !important;
          }
          
          .summary {
            page-break-before: avoid !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="quotation-container">
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
        
        <!-- Quotation Information -->
        <div class="quotation-info">
          <div class="quotation-to">
            <div class="section-title">Quotation To:</div>
            <div class="customer-info">
              <div><strong>${data.customer.name}</strong></div>
              ${data.customer.address ? `<div>${data.customer.address}</div>` : ''}
              ${(data.customer.city || data.customer.state || data.customer.pincode) ? `<div>${data.customer.city}, ${data.customer.state} - ${data.customer.pincode}</div>` : ''}
              ${data.customer.phone ? `<div>Phone: ${data.customer.phone}</div>` : ''}
              ${data.customer.email ? `<div>Email: ${data.customer.email}</div>` : ''}
              ${data.customer.gstNumber ? `<div>GST: ${data.customer.gstNumber}</div>` : ''}
            </div>
          </div>
          
          <div class="quotation-details">
            <div class="section-title">Quotation Details:</div>
            <div class="quotation-meta">
              <div><strong>Quotation Number:</strong> ${data.billNumber}</div>
              <div><strong>Quotation Date:</strong> ${new Date(data.billDate).toLocaleDateString()}</div>
              <div><strong>Valid Until:</strong> ${validityDate.toLocaleDateString()}</div>
            </div>
          </div>
        </div>
        
        ${data.terms ? `
        <div class="validity-note">
          ${sanitizeForTemplate(data.terms).replace(/\n/g, '<br />')}
        </div>
        ` : ''}
        
        ${(data as any).gstOption === 'exclude' ? `
          <div class="gst-note">
            <strong>GST Note:</strong> GST not included in the above prices. Applicable GST will be charged separately if required.
          </div>
        ` : ''}
        
        ${((data as any).gstOption === 'include' && data.totalTax > 0) ? `
          <div class="gst-note">
            <strong>GST Note:</strong> Prices include GST.
            ${(data as any).gstData?.placeOfSupply ? `<br />Place of Supply: ${(data as any).gstData.placeOfSupply} (State Code: ${(data as any).gstData.placeOfSupplyCode || '29'})` : ''}
            ${(data as any).gstData?.isIntraState ? '<br />GST Type: Intra-state (CGST + SGST)' : ((data as any).gstData ? '<br />GST Type: Inter-state (IGST)' : '')}
          </div>
        ` : ''}
        
        <!-- Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
              <tr>
                <td>${sanitizeForTemplate(item.description)}</td>
                <td>${item.quantity}</td>
                <td>₹${item.unitPrice.toLocaleString()}</td>
                <td>₹${item.total.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- Summary -->
        <div class="summary">
          <div class="summary-row">
            <span>Subtotal:</span>
            <span>₹${data.subtotal.toLocaleString()}</span>
          </div>
          ${data.serviceCharge && data.serviceCharge > 0 ? `
            <div class="summary-row">
              <span>Service Charge:</span>
              <span>₹${data.serviceCharge.toLocaleString()}</span>
            </div>
          ` : ''}
          <div class="summary-row total">
            <span>Total Amount:</span>
            <span>₹${data.totalAmount.toLocaleString()}</span>
          </div>
        </div>
        
        <!-- Additional Info -->
        ${data.notes ? `
          <div class="notes-section">
            <div class="notes-title">Additional Info:</div>
            <div class="notes-content">${sanitizeForTemplate(data.notes)}</div>
          </div>
        ` : ''}
        
        ${data.bankDetails ? `
          <div class="bank-section">
            <div class="bank-title">Bank Details for Payment</div>
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
        
        <!-- Footer -->
        <div class="footer">
          <p>Thank you for considering our services!</p>
          <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}