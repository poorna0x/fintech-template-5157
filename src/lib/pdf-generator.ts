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
  hideGstInHeader?: boolean;
}

// Global flag to prevent multiple print operations
let isPrinting = false;

export function generateBillPDF(billData: PDFBillData, action: 'print' | 'pdf' = 'print'): void {
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
          if (printWindow && !printWindow.closed) {
            printWindow.close();
          }
          isPrinting = false; // Reset flag after successful printing
    }, 1000);
      }, 100);
    };
    
  } catch (error) {
    console.error('Error generating bill PDF:', error);
    alert('Error generating bill. Please try again.');
    isPrinting = false; // Reset flag on error
  }
}

function handleMobilePrint(billData: PDFBillData, action: 'print' | 'pdf'): void {
  // Store original content for restoration
  const originalBodyHTML = document.body.innerHTML;
  const originalTitle = document.title;
  const reactRootId = document.getElementById('root')?.id || 'root';
  
  // Store references to cleanup
  let afterPrintHandler: (() => void) | null = null;
  
  const cleanup = () => {
    try {
      // Remove print event listener
      if (afterPrintHandler) {
        window.removeEventListener('afterprint', afterPrintHandler);
      }
      
      // Only cleanup if still printing (prevent multiple cleanups)
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
      
      const additionalPrintStyles = document.getElementById('mobile-print-additional-styles');
      if (additionalPrintStyles && additionalPrintStyles.parentNode) {
        additionalPrintStyles.parentNode.removeChild(additionalPrintStyles);
      }
      
      const additionalStyles = document.getElementById('mobile-pdf-format-fix');
      if (additionalStyles && additionalStyles.parentNode) {
        additionalStyles.parentNode.removeChild(additionalStyles);
      }
      
      // Restore original title
      document.title = originalTitle;
      
      // Restore original body HTML
      document.body.innerHTML = originalBodyHTML;
      
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
    // Generate full HTML document (like AMC generator)
    const fullHTML = generateBillHTML(billData);
    
    // Parse the HTML to extract body content and styles
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = fullHTML;
    
    // Extract styles from head
    const styleMatch = fullHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const styles = styleMatch ? styleMatch[1] : '';
    
    // Extract body content - find everything between <body> and </body>
    const bodyMatch = fullHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    
    // Inject styles into head
    const styleElement = document.createElement('style');
    styleElement.id = 'mobile-print-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
    
    // COMPLETELY REPLACE body HTML with bill document content (like desktop does with new window)
    // This ensures ONLY the bill content is visible when print dialog opens
    document.body.innerHTML = bodyContent;
    document.title = `Bill - ${billData.billNumber}`;
    
    // Add additional mobile-optimized print styles
    const printStyles = document.createElement('style');
    printStyles.id = 'mobile-print-additional-styles';
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
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
        position: relative;
      }
      
      .bill-container {
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
        overflow: hidden;
        position: relative;
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
        flex-direction: column;
        margin-bottom: 15px;
        gap: 15px;
        padding: 0;
        width: 100%;
        box-sizing: border-box;
      }
      
      .bill-to, .bill-details {
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
      
      .customer-info, .bill-meta {
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
        overflow-wrap: break-word;
        overflow: hidden;
        text-overflow: ellipsis;
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
        margin: 15px 0 0 0;
        text-align: right;
        width: 100%;
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
        margin: 15px 0 0 0;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
        width: 100%;
        box-sizing: border-box;
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
        padding-left: 20px;
        padding-right: 0;
        width: 100%;
        box-sizing: border-box;
      }
      
      .terms-list li {
        margin-bottom: 8px;
        list-style-type: disc;
        padding-right: 0;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      .signature-seal {
        width: 80px !important;
        height: 80px !important;
        margin: 15px auto 8px auto !important;
      }
      
      .signature-label {
        font-size: 12px !important;
      }
      
      .signature-date {
        font-size: 10px !important;
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
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }
        
        .bill-container {
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
          overflow: hidden !important;
        }
        
        .bill-info {
          flex-direction: column !important;
          padding: 0 !important;
          width: 100% !important;
        }
        
        .bill-to, .bill-details {
          width: 100% !important;
        }
        
        .items-table {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 0 15px 0 !important;
          font-size: 9px !important;
        }
        
        .summary {
          width: 100% !important;
          margin: 15px 0 0 0 !important;
        }
        
        .notes-section {
          width: 100% !important;
          margin: 15px 0 0 0 !important;
          padding-right: 0 !important;
        }
        
        .terms-list {
          padding-left: 20px !important;
          padding-right: 0 !important;
          margin-right: 0 !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        
        .terms-list li {
          padding-right: 0 !important;
          margin-right: 0 !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
        }
        
        .footer {
          width: 100% !important;
          margin: 15px 0 0 0 !important;
          padding-right: 0 !important;
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
    
    // Add additional styles to document
    document.head.appendChild(printStyles);
    
    // Add additional mobile-specific optimizations
    const additionalStyles = document.createElement('style');
    additionalStyles.id = 'mobile-pdf-format-fix';
    additionalStyles.textContent = `
      @media print {
        @page {
          size: A4 !important;
          margin: 20mm 8mm 20mm 8mm !important;
        }
        
        body {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        .bill-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 15px 10px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
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
    
      // Additional safety: keep bill content visible for at least 10 seconds
      // This ensures mobile browsers have time to capture the content
      setTimeout(() => {
        // Don't cleanup if already cleaned up
        if (isPrinting) {
          // This is just a safety net - cleanup should have happened by now
          console.log('Safety timeout reached - keeping bill content visible');
        }
      }, 10000);
    }
    
  } catch (error) {
    console.error('Error generating mobile bill PDF:', error);
    alert('Error generating bill. Please try again.');
    cleanup();
    isPrinting = false;
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
          ${!data.hideGstInHeader ? `<div>GST: ${data.company.gstNumber}</div>` : ''}
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
          padding-left: 20px;
          padding-right: 0;
          width: 100%;
          box-sizing: border-box;
        }
        
        .terms-list li {
          margin-bottom: 8px;
          list-style-type: disc;
          padding-right: 0;
          word-wrap: break-word;
          overflow-wrap: break-word;
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
            ${!data.hideGstInHeader ? `<div>GST: ${data.company.gstNumber}</div>` : ''}
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
