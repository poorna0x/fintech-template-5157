import { Bill } from '@/types';

interface AMCPDFData {
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
  totalTax: number;
  serviceCharge?: number;
  totalAmount: number;
  notes?: string;
  terms?: string;
}

function generateAMCHTML(data: AMCPDFData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AMC Agreement - ${data.billNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Poppins', sans-serif;
          line-height: 1.6;
          color: #333;
          background: white;
          margin: 0;
          padding: 0;
          width: 210mm; /* A4 width */
          min-height: 297mm; /* A4 height */
          max-width: 210mm; /* Fixed A4 width */
          padding: 15mm 10mm 25mm 10mm; /* Top, Right, Bottom, Left - A4 padding with more space for border */
          box-sizing: border-box;
          overflow: visible;
        }
        
        .bill-container {
          width: 100%;
          max-width: 100%;
          margin: 0;
          background: white;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 8px 15px rgba(0, 0, 0, 0.4);
          padding: 40px;
          overflow: visible;
          border-radius: 12px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #000000;
          padding-bottom: 15px;
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
        
        .document-title {
          font-size: 24px;
          font-weight: bold;
          color: #000000;
          margin: 20px 0;
        }
        
        .section-title {
          font-size: 18px;
          font-weight: bold;
          color: #000000;
          margin-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 5px;
        }
        
        .agreement-intro {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #000000;
        }
        
        .customer-info-section {
          background: #f0f9ff;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #0ea5e9;
        }
        
        .customer-details {
          margin-top: 10px;
        }
        
        .customer-detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .customer-label {
          font-weight: 600;
          color: #374151;
        }
        
        .customer-value {
          color: #0ea5e9;
          font-weight: 500;
        }
        
        .services-section {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #000000;
        }
        
        .services-title {
          font-weight: bold;
          color: #000000;
          margin-bottom: 10px;
          font-size: 16px;
        }
        
        .services-list {
          margin: 0;
          padding-left: 20px;
        }
        
        .services-list li {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .terms-section {
          background: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #6b7280;
        }
        
        .terms-title {
          font-weight: bold;
          color: #374151;
          margin-bottom: 10px;
          font-size: 16px;
          text-align: center;
        }
        
        .terms-list {
          margin: 0;
          padding-left: 20px;
        }
        
        .terms-list li {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .summary-section {
          background: #f0fdf4;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #10b981;
        }
        
        .summary-title {
          font-weight: bold;
          color: #047857;
          margin-bottom: 10px;
          font-size: 16px;
          text-align: center;
        }
        
        .summary-content p {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .agreement-details {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .agreement-details-title {
          font-weight: bold;
          color: #000000;
          margin-bottom: 15px;
          font-size: 16px;
          text-align: center;
        }
        
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        
        .detail-item {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .detail-label {
          font-weight: 600;
          color: #374151;
        }
        
        .detail-value {
          color: #000000;
          font-weight: 500;
        }
        
        .signatures {
          margin-top: 40px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        
        .signature-box {
          text-align: center;
          border-top: 2px solid #000000;
          padding-top: 15px;
        }
        
        .signature-label {
          font-weight: bold;
          color: #000000;
          margin-bottom: 5px;
        }
        
        .signature-line {
          height: 50px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          margin: 20px 0 10px 0;
        }
        
        .signature-date {
          font-size: 12px;
          color: #6b7280;
        }
        
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
        }
        
        @media print {
          body {
            width: 210mm;
            min-height: 297mm;
            padding: 0;
            margin: 0;
            box-shadow: none;
          }
          
          .bill-container {
            box-shadow: none;
            padding: 40px;
            width: 100%;
            max-width: 100%;
            margin: 0;
          }
          
          @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
          }
          
          @page :first {
            margin-top: 20mm;
          }
          
          @page :left {
            margin-left: 15mm;
            margin-right: 10mm;
          }
          
          @page :right {
            margin-left: 10mm;
            margin-right: 15mm;
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
          </div>
          <h2 class="document-title">AMC AGREEMENT</h2>
        </div>

      <!-- Agreement Introduction -->
      <div class="agreement-intro">
        <p>We M/s <strong>Hydrogen RO</strong>, Authorized for Service by RO Care India, undertake to maintain your <strong>RO Water Purifier</strong> Unit as detailed below:</p>
      </div>

      <!-- Customer Information -->
      <div class="customer-info-section">
        <h3 class="section-title">Customer Information</h3>
        <div class="customer-details">
          <div class="customer-detail-row">
            <span class="customer-label">Customer Name:</span>
            <span class="customer-value">${data.customer.name}</span>
          </div>
          <div class="customer-detail-row">
            <span class="customer-label">Phone Number:</span>
            <span class="customer-value">${data.customer.phone}</span>
          </div>
          <div class="customer-detail-row">
            <span class="customer-label">Email:</span>
            <span class="customer-value">${data.customer.email}</span>
          </div>
          <div class="customer-detail-row">
            <span class="customer-label">Address:</span>
            <span class="customer-value">${data.customer.address}, ${data.customer.city} - ${data.customer.pincode}</span>
          </div>
          ${data.customer.gstNumber ? `
          <div class="customer-detail-row">
            <span class="customer-label">GST Number:</span>
            <span class="customer-value">${data.customer.gstNumber}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Services Covered -->
      <div class="services-section">
        <h3 class="services-title">SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:</h3>
        <ul class="services-list">
          <li><strong>Breakdown Support:</strong> If any breakdown or problem happens with the RO during this 1-year period, the company will provide service without extra charges.</li>
          <li><strong>Filters / RO Membrane / Consumables:</strong> Company will clean, repair, or replace filters and parts needed for smooth working.</li>
          <li><strong>Safe RO output:</strong> Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.</li>
          <li><strong>Clean cosmetics and smooth working</strong> of the machine.</li>
          <li><strong>Quick service:</strong> Any breakdown will be resolved within 24 hours.</li>
          <li><strong>Full Care of RO:</strong> The company takes responsibility for complete maintenance and support for 1 year, including Pre Sediment Filtration (with terms & conditions).</li>
        </ul>
      </div>

      <!-- Terms and Conditions -->
      <div class="terms-section">
        <h3 class="terms-title">⚖️ TERMS AND CONDITIONS</h3>
        <ul class="terms-list">
          <li><strong>No Early Termination:</strong> You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.</li>
          <li><strong>Extra Charges:</strong> If service is outside municipal limits, extra charges for travel/stay will apply.</li>
          <li><strong>Disputes:</strong> Any legal disputes will be handled only in Bangalore courts.</li>
          <li><strong>Renewal:</strong> After expiry, renewal requires a new agreement.</li>
          <li><strong>Customer's Duty:</strong> The customer must make the RO available for servicing when the company's authorized representative visits.</li>
          <li>If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.</li>
          <li><strong>Agreement Modification:</strong> Cannot be changed unless written and signed by both parties.</li>
          <li><strong>Not Covered:</strong> Display and lights of the RO are not covered under this AMC.</li>
        </ul>
      </div>

      <!-- Summary Section -->
      <div class="summary-section">
        <h3 class="summary-title">🔍 Summary in Simple Words</h3>
        <div class="summary-content">
          <p>You (the customer) paid ₹${data.totalAmount.toLocaleString()} for 1-year full AMC service of your RO Water Purifier.</p>
          <p>All repairs, filters, and breakdown services are included, with a guarantee of 24-hour resolution.</p>
          <p>The service covers water quality maintenance (50–150 TDS) and overall machine health.</p>
          <p>Extra travel charges apply if your location is outside the municipal area.</p>
          <p>You can't cancel/transfer this AMC until it expires.</p>
          <p>Legal disputes go to Bangalore court.</p>
          <p>The AMC does not cover display and lights of the RO.</p>
        </div>
      </div>

      <!-- Agreement Details -->
      <div class="agreement-details">
        <h3 class="agreement-details-title">AGREEMENT DETAILS</h3>
        <div class="details-grid">
          <div>
            <div class="detail-item">
              <span class="detail-label">Agreement Number:</span>
              <span class="detail-value">${data.billNumber}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Agreement Date:</span>
              <span class="detail-value">${data.billDate}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Agreement Amount:</span>
              <span class="detail-value">₹${data.totalAmount.toLocaleString()}</span>
            </div>
          </div>
          <div>
            <div class="detail-item">
              <span class="detail-label">Customer Name:</span>
              <span class="detail-value">${data.customer.name}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Phone:</span>
              <span class="detail-value">${data.customer.phone}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Address:</span>
              <span class="detail-value">${data.customer.address}, ${data.customer.city}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Additional Notes -->
      ${data.notes ? `
        <div class="agreement-details">
          <h3 class="agreement-details-title">Additional Notes</h3>
          <p>${data.notes}</p>
        </div>
      ` : ''}

      <!-- Signatures -->
      <div class="signatures">
        <div class="signature-box">
          <div class="signature-label">Customer Signature</div>
          <div class="signature-line"></div>
          <div class="signature-date">Date: _______________</div>
        </div>
        <div class="signature-box">
          <div class="signature-label">Authorized Signatory</div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">M/s Hydrogen RO</div>
          <div class="signature-line"></div>
          <div class="signature-date">Date: _______________</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-logo">
          <span style="color: #2563eb; font-weight: bold;">💧 Hydrogen RO</span>
        </div>
        <p class="footer-text">This is a computer generated document and does not require a physical signature.</p>
        <p class="footer-text">Generated on: ${new Date().toLocaleDateString('en-IN')} | Professional RO Water Purifier Services in Bengaluru</p>
      </div>
    </body>
    </html>
  `;
}

export function generateAMCPDF(bill: Bill, action: 'print' | 'pdf' = 'print'): void {
  try {
    // Check if it's a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // For mobile devices, use a different approach
      handleMobilePrint(bill, action);
      return;
    }
    
    // Create a new window for printing to avoid destroying React components
    const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    if (!printWindow) {
      // If popup is blocked, fall back to mobile print method
      console.warn('Popup blocked, falling back to mobile print method');
      alert('Popup blocked by browser. Using alternative printing method...');
      handleMobilePrint(bill, action);
      return;
    }
    
    const data: AMCPDFData = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      company: bill.company,
      customer: bill.customer,
      items: bill.items,
      subtotal: bill.subtotal,
      totalTax: bill.totalTax,
      serviceCharge: bill.serviceCharge,
      totalAmount: bill.totalAmount,
      notes: bill.notes,
      terms: bill.terms
    };
    
    // Write content to new window
    printWindow.document.write(generateAMCHTML(data));
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
    console.error('Error generating AMC PDF:', error);
    alert('Error generating AMC Agreement. Please try again.');
  }
}

function handleMobilePrint(bill: Bill, action: 'print' | 'pdf'): void {
  try {
    // Store original content
    const originalBody = document.body.innerHTML;
    const originalTitle = document.title;
    
    const data: AMCPDFData = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      company: bill.company,
      customer: bill.customer,
      items: bill.items,
      subtotal: bill.subtotal,
      totalTax: bill.totalTax,
      serviceCharge: bill.serviceCharge,
      totalAmount: bill.totalAmount,
      notes: bill.notes,
      terms: bill.terms
    };
    
    // Replace body content temporarily
    document.body.innerHTML = generateAMCHTML(data);
    document.title = `AMC Agreement - ${bill.billNumber}`;
    
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
        line-height: 1.6;
        color: #333;
        background: white;
        margin: 0;
        padding: 10mm;
        font-size: 10px;
        -webkit-text-size-adjust: 100%;
      }
      
      .bill-container {
        width: 100%;
        max-width: 100%;
        margin: 0;
        background: white;
        padding: 0;
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 8px 15px rgba(0, 0, 0, 0.4);
        border-radius: 12px;
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
          line-height: 1.6 !important;
        }
        
        .bill-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
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
    console.error('Error generating mobile AMC PDF:', error);
    alert('Error generating AMC Agreement. Please try again.');
  }
}
