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
            padding: 15mm;
            font-size: 11px;
        }
      
      .quotation-container {
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
        
        .quotation-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
              border: 2px solid #000 !important;
              box-shadow: none !important;
              background: white !important;
              box-sizing: border-box !important;
            }
            
            @page {
              size: A4 !important;
              margin: 0 !important;
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
  try {
    // Store original content
    const originalBody = document.body.innerHTML;
    const originalTitle = document.title;
    
    // Create the quotation content
    const quotationContent = createQuotationContent(quotationData);
    console.log('Mobile quotation content generated:', quotationContent.substring(0, 200) + '...');
    
    // Replace body content temporarily
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
        padding: 10mm;
        font-size: 10px;
        -webkit-text-size-adjust: 100%;
      }
      
      .quotation-container {
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
          padding: 10mm !important;
          font-size: 11pt !important;
          line-height: 1.4 !important;
        }
        
        .quotation-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 2px solid #000 !important;
          box-shadow: none !important;
          background: white !important;
          box-sizing: border-box !important;
        }
        
        @page {
          size: A4 !important;
          margin: 0 !important;
        }
      }
    `;
    
    // Add styles to document
    document.head.appendChild(printStyles);
    
    // Wait a moment for styles to apply, then print
    setTimeout(() => {
      if (action === 'print') {
        // Direct print without preview
        window.print();
      } else {
        // Save as PDF (browser will show save dialog)
        window.print();
      }
      
      // Clean up after printing - restore original content immediately
      setTimeout(() => {
        document.body.innerHTML = originalBody;
        document.title = originalTitle;
        if (document.head.contains(printStyles)) {
          document.head.removeChild(printStyles);
        }
      }, 1000); // Longer timeout for mobile
    }, 200); // Longer delay for mobile
    
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
          </div>
        </div>
      </div>
      
      <!-- Validity Note -->
      <div class="validity-note">
        <strong>Note:</strong> This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.
      </div>
      
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
        <div class="summary-row total">
          <span>Total Amount:</span>
          <span>₹${data.totalAmount.toLocaleString()}</span>
        </div>
      </div>
      
      <!-- Additional Info -->
      ${data.notes ? `
        <div class="notes-section">
          <div class="notes-title">Additional Info:</div>
          <div class="notes-content">${data.notes}</div>
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
          padding: 15mm 12mm 15mm 12mm; /* Reduced margins for more content space */
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
          border: 2px solid #000;
          min-height: calc(297mm - 30mm); /* A4 height minus margins */
          box-sizing: border-box;
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
            border: 2px solid #000 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
          }
          
          @page {
            size: A4 !important;
            margin: 15mm !important;
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
        
        <!-- Validity Note -->
        <div class="validity-note">
          <strong>Note:</strong> This quotation is valid for 30 days from the date of issue. Prices are subject to change without prior notice.
        </div>
        
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