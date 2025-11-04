// PDF Generation utility for bills
// This is a simple implementation using browser's print functionality
// For production, consider using libraries like jsPDF or Puppeteer

import { sanitizeForTemplate } from './sanitize';

export interface PDFBillData {
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

export function generateBillPDF(billData: PDFBillData, action: 'print' | 'pdf' = 'print'): void {
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
      alert('Please allow popups to print the bill');
      return;
    }
    
    // Create the bill content
    const billContent = createBillContent(billData);
    console.log('Bill content generated:', billContent.substring(0, 200) + '...');
    
    // Write content to new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill - ${billData.billNumber}</title>
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
        ${billContent}
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
    console.error('Error generating bill PDF:', error);
    alert('Error generating bill. Please try again.');
  }
}

function handleMobilePrint(billData: PDFBillData, action: 'print' | 'pdf'): void {
  try {
    // Store original content
    const originalBody = document.body.innerHTML;
    const originalTitle = document.title;
    
    // Create the bill content
    const billContent = createBillContent(billData);
    console.log('Mobile bill content generated:', billContent.substring(0, 200) + '...');
    
    // Replace body content temporarily
    document.body.innerHTML = billContent;
    document.title = `Bill - ${billData.billNumber}`;
    
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
        padding: 0;
        font-size: 12px;
        -webkit-text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      .bill-container {
        width: 100%;
        max-width: 100%;
        margin: 0;
        background: white;
        padding: 20px 1px 20px 1px;
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
          print-color-adjust: exact !important;
        }
        
        body {
          margin: 0 !important;
          padding: 15mm !important;
          font-size: 12pt !important;
          line-height: 1.4 !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          width: 210mm !important;
          min-height: 297mm !important;
          max-width: 210mm !important;
        }
        
        .bill-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: white !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          width: 210mm !important;
          min-height: 297mm !important;
          max-width: 210mm !important;
        }
        
        @page {
          size: A4 !important;
          margin: 20mm 8mm 20mm 8mm !important;
          border: 2px solid #000000 !important;
          border-radius: 12px !important;
        }
        
        /* Force A4 format for devices that default to Letter */
        @page :first {
          size: A4 !important;
          margin: 20mm 8mm 20mm 8mm !important;
          border: 2px solid #000000 !important;
          border-radius: 12px !important;
        }
        
        /* Additional A4 enforcement */
        @media print and (max-width: 210mm) {
          @page {
            size: A4 !important;
            margin: 20mm 8mm 20mm 8mm !important;
          }
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
        
        /* Additional mobile PDF compatibility */
        .items-table {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .items-table th {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .summary-row.total {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .header {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    
    // Add styles to document
    document.head.appendChild(printStyles);
    
    // Add additional mobile-specific optimizations
    const additionalStyles = document.createElement('style');
    additionalStyles.id = 'mobile-pdf-format-fix';
    additionalStyles.textContent = `
      @media print {
        @page {
          size: 210mm 297mm !important;
          margin: 20mm 8mm 20mm 8mm !important;
        }
        
        body {
          width: 210mm !important;
          height: 297mm !important;
          max-width: 210mm !important;
          max-height: 297mm !important;
        }
        
        .bill-container {
          width: 210mm !important;
          height: 297mm !important;
          max-width: 210mm !important;
          max-height: 297mm !important;
        }
      }
    `;
    document.head.appendChild(additionalStyles);
    
    // Force A4 format with JavaScript
    const forceA4Format = () => {
      const style = document.createElement('style');
      style.textContent = `
        @page {
          size: 210mm 297mm !important;
          margin: 20mm 8mm 20mm 8mm !important;
        }
      `;
      document.head.appendChild(style);
    };
    
    // Apply format fix multiple times to ensure it sticks
    forceA4Format();
    setTimeout(forceA4Format, 100);
    setTimeout(forceA4Format, 200);
    
    // Wait a moment for styles to apply, then print
    setTimeout(() => {
      try {
        if (action === 'print') {
          // Direct print without preview
          window.print();
        } else {
          // Save as PDF (browser will show save dialog)
          window.print();
        }
        
        // Clean up after printing - restore original content
        setTimeout(() => {
          try {
            document.body.innerHTML = originalBody;
            document.title = originalTitle;
            if (document.head.contains(printStyles)) {
              document.head.removeChild(printStyles);
            }
            if (document.head.contains(additionalStyles)) {
              document.head.removeChild(additionalStyles);
            }
          } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
            // Force cleanup even if there's an error
            location.reload();
          }
        }, 2000); // Longer timeout for mobile
      } catch (printError) {
        console.error('Error during print:', printError);
        // Restore content immediately on error
        document.body.innerHTML = originalBody;
        document.title = originalTitle;
        if (document.head.contains(printStyles)) {
          document.head.removeChild(printStyles);
        }
        if (document.head.contains(additionalStyles)) {
          document.head.removeChild(additionalStyles);
        }
        alert('Error generating PDF. Please try again.');
      }
    }, 300); // Longer delay for mobile
    
  } catch (error) {
    console.error('Error generating mobile bill PDF:', error);
    alert('Error generating bill. Please try again.');
  }
}

function createBillContent(data: PDFBillData): string {
  return `
    <div class="bill-container">
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
      
      <!-- Bill Information -->
      <div class="bill-info">
        <div class="bill-to">
          <div class="section-title">Bill To:</div>
          <div class="customer-info">
            <div><strong>${sanitizeForTemplate(data.customer.name)}</strong></div>
            ${data.customer.address ? `<div>${sanitizeForTemplate(data.customer.address)}</div>` : ''}
            ${(data.customer.city || data.customer.state || data.customer.pincode) ? `<div>${data.customer.city}, ${data.customer.state} - ${data.customer.pincode}</div>` : ''}
            ${data.customer.phone ? `<div>Phone: ${data.customer.phone}</div>` : ''}
            ${data.customer.email ? `<div>Email: ${data.customer.email}</div>` : ''}
            ${data.customer.gstNumber ? `<div>GST: ${data.customer.gstNumber}</div>` : ''}
          </div>
        </div>
        
        <div class="bill-details">
          <div class="section-title">Bill Details:</div>
          <div class="bill-meta">
            <div><strong>Bill Number:</strong> ${data.billNumber}</div>
            <div><strong>Bill Date:</strong> ${new Date(data.billDate).toLocaleDateString()}</div>
          </div>
        </div>
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
                  const cleanTerm = term.replace(/^\d+\.\s*/, ''); // Remove number if present
                  return `<li>${cleanTerm}</li>`;
                }).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <!-- Footer -->
      <div class="footer">
        <p>Thank you for choosing Hydrogenro!</p>
        <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
      </div>
    </div>
  `;
}

function generateBillHTML(data: PDFBillData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bill - ${data.billNumber}</title>
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
        
        .bill-container {
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
        
        
        .footer {
          margin: 15px 15px 0 15px;
          padding: 10px 0;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 10px;
          color: #6b7280;
        }
        
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .status-pending {
          background-color: #fef3c7;
          color: #d97706;
        }
        
        .status-paid {
          background-color: #d1fae5;
          color: #059669;
        }
        
        .status-overdue {
          background-color: #fee2e2;
          color: #dc2626;
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
          
          .bill-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px 1px 20px 1px !important;
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
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
          
          .header {
            page-break-after: avoid !important;
            margin-top: 0 !important;
            padding-top: 5px !important;
          }
          
          .items-table {
            page-break-inside: auto !important;
          }
          
          .summary {
            page-break-before: avoid !important;
            margin-top: 20px !important;
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
      <div class="bill-container">
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
        
        <!-- Bill Information -->
        <div class="bill-info">
          <div class="bill-to">
            <div class="section-title">Bill To:</div>
            <div class="customer-info">
              <div><strong>${sanitizeForTemplate(data.customer.name)}</strong></div>
              ${data.customer.address ? `<div>${sanitizeForTemplate(data.customer.address)}</div>` : ''}
              ${(data.customer.city || data.customer.state || data.customer.pincode) ? `<div>${data.customer.city}, ${data.customer.state} - ${data.customer.pincode}</div>` : ''}
              ${data.customer.phone ? `<div>Phone: ${data.customer.phone}</div>` : ''}
              ${data.customer.email ? `<div>Email: ${data.customer.email}</div>` : ''}
              ${data.customer.gstNumber ? `<div>GST: ${data.customer.gstNumber}</div>` : ''}
            </div>
          </div>
          
          <div class="bill-details">
            <div class="section-title">Bill Details:</div>
            <div class="bill-meta">
              <div><strong>Bill Number:</strong> ${data.billNumber}</div>
              <div><strong>Bill Date:</strong> ${new Date(data.billDate).toLocaleDateString()}</div>
            </div>
          </div>
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
                    const cleanTerm = term.replace(/^\d+\.\s*/, ''); // Remove number if present
                    return `<li>${sanitizeForTemplate(cleanTerm)}</li>`;
                  }).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        <!-- Footer -->
        <div class="footer">
          <p>Thank you for choosing Hydrogenro!</p>
          <p>For any queries, contact us at ${data.company.phone} or ${data.company.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
