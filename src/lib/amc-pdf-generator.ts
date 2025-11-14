import { Bill } from '@/types';
import { sanitizeForTemplate } from './sanitize';

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
    roModel?: string;
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
  validity?: string;
  agreementIntro?: string;
}

interface AMCPDFOptions {
  includeDetails?: boolean;
}

function generateAMCHTML(data: AMCPDFData, options?: AMCPDFOptions): string {
  const includeDetails = options?.includeDetails !== false;
  const isTermsOnly = !includeDetails;
  const documentTitleText = isTermsOnly ? 'AMC AGREEMENT DETAILS' : 'AMC AGREEMENT';

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
          box-sizing: border-box;
          overflow: visible;
          position: relative;
        }
        
        .bill-container {
          width: 100%;
          max-width: 100%;
          margin: 0;
          background: white;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 8px 15px rgba(0, 0, 0, 0.4);
          padding: 20mm 15mm 20mm 15mm; /* Top, Right, Bottom, Left - proper padding for content */
          overflow: visible;
          border-radius: 12px;
          border: none;
          box-sizing: border-box;
          position: relative;
          z-index: 2;
        }
        
        /* Ensure borders appear on printed pages */
        @media print {
          @page {
            /* Page margin creates space for border + content padding */
            margin: 13mm;
            size: A4;
          }
          
          /* Single border using body border - simplest approach */
          body {
            padding: 0 !important;
            margin: 0 !important;
            border: 2px solid #000000 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            box-sizing: border-box !important;
          }
          
          /* Remove ALL pseudo-element borders to prevent double border */
          body::before,
          body::after {
            display: none !important;
            content: none !important;
            border: none !important;
            outline: none !important;
          }
          
          .bill-container {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            outline: none !important;
            /* Generous padding ensures content never touches border - even at page breaks */
            padding-top: 10mm !important;    /* Space from top border on first page */
            padding-bottom: 10mm !important;  /* Space from bottom border on last page */
            padding-left: 5mm !important;
            padding-right: 5mm !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            /* Ensure padding is maintained across page breaks */
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
          }
          
          /* Ensure first element respects container padding */
          .bill-container > *:first-child {
            margin-top: 0 !important;
          }
          
          /* Add extra spacing to major sections to prevent touching at page breaks */
          .detail-card,
          .services-section,
          .terms-section {
            margin-top: 8mm !important;
            margin-bottom: 8mm !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          body.terms-only .terms-section {
            margin-top: 4mm !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          
          /* Ensure header has proper spacing */
          .header {
            margin-top: 0 !important;
            margin-bottom: 12mm !important;
          }
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
        
        body.terms-only .terms-section {
          margin-top: 12px;
          page-break-inside: auto;
          break-inside: auto;
        }
        
        body.terms-only .services-section + .terms-section {
          margin-top: 12px;
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
        
        
        .agreement-details {
          margin-bottom: 25px;
        }
        
        .agreement-details-title {
          font-size: 16px;
          font-weight: 600;
          color: #333333;
          margin-bottom: 24px;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 0;
          border: none;
        }
        
        .detail-card {
          background: #fafafa;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .detail-card-title {
          font-size: 14px;
          font-weight: 600;
          color: #333333;
          padding: 0;
          margin: 0 0 18px 0;
          border: none;
          text-transform: uppercase;
          letter-spacing: 1px;
          background: transparent;
          text-align: left;
        }
        
        .detail-items-list {
          display: flex;
          flex-direction: column;
          padding: 0;
          margin: 0;
          gap: 14px;
        }
        
        .detail-item-new {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 16px;
          padding: 0;
          background: transparent;
          border: none;
        }
        
        .detail-label-new {
          font-weight: 500;
          color: #666666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
        }
        
        .detail-value-new {
          color: #000000;
          font-weight: 400;
          font-size: 13px;
          text-align: left;
          word-break: break-word;
          margin: 0;
        }
        
        .address-value {
          text-align: left !important;
          line-height: 1.5;
        }
        
        .validity-value {
          color: #059669;
          font-weight: 600;
        }
        
        .amount-value {
          color: #dc2626;
          font-weight: 700;
          font-size: 15px;
        }
        
        .signatures {
          margin-top: 40px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .signature-box {
          text-align: center;
          padding-top: 15px;
        }
        
        .signature-label {
          font-weight: bold;
          color: #000000;
          margin-bottom: 5px;
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
            margin: 13mm;
            border: 2px solid #000000;
          }
          
          @page :first {
            margin: 13mm;
            border: 2px solid #000000;
          }
          
          @page :left {
            margin: 13mm;
            border: 2px solid #000000;
          }
          
          @page :right {
            margin: 13mm;
            border: 2px solid #000000;
          }
        }
      </style>
    </head>
    <body class="${isTermsOnly ? 'terms-only' : ''}">
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
          <h2 class="document-title">${documentTitleText}</h2>
        </div>

      <!-- Agreement Introduction -->
      ${data.agreementIntro ? `
        <div class="agreement-intro">
          <p>${data.agreementIntro}</p>
        </div>
      ` : `
        <div class="agreement-intro">
          <p>We M/s <strong>Hydrogen RO</strong>, Authorized Service Provider, undertake to maintain your <strong>RO Water Purifier</strong> Unit as detailed below:</p>
        </div>
      `}

      ${includeDetails ? `
      <!-- Agreement Details -->
      <div class="agreement-details">
        <h3 class="agreement-details-title">AGREEMENT DETAILS</h3>
        
        <!-- Customer Information Card -->
        <div class="detail-card">
          <h4 class="detail-card-title">Customer Information</h4>
          <div class="detail-items-list">
            <div class="detail-item-new">
              <div class="detail-label-new">Customer Name</div>
              <div class="detail-value-new">${sanitizeForTemplate(data.customer.name)}</div>
            </div>
            <div class="detail-item-new">
              <div class="detail-label-new">Phone Number</div>
              <div class="detail-value-new">${data.customer.phone}</div>
            </div>
            ${data.customer.email && data.customer.email.trim() ? `
            <div class="detail-item-new">
              <div class="detail-label-new">Email</div>
              <div class="detail-value-new">${data.customer.email.trim()}</div>
            </div>
            ` : ''}
            <div class="detail-item-new">
              <div class="detail-label-new">Address</div>
              <div class="detail-value-new address-value">${sanitizeForTemplate(data.customer.address)}${data.customer.city ? ', ' + sanitizeForTemplate(data.customer.city) : ''}${data.customer.pincode ? ' - ' + sanitizeForTemplate(data.customer.pincode) : ''}</div>
            </div>
            ${data.customer.gstNumber && data.customer.gstNumber.trim() ? `
            <div class="detail-item-new">
              <div class="detail-label-new">GST Number</div>
              <div class="detail-value-new">${data.customer.gstNumber.trim()}</div>
            </div>
            ` : ''}
            <div class="detail-item-new">
              <div class="detail-label-new">RO Model</div>
              <div class="detail-value-new">${sanitizeForTemplate(data.customer.roModel || data.items[0]?.description || 'RO Water Purifier')}</div>
            </div>
          </div>
        </div>

        <!-- Agreement Information Card -->
        <div class="detail-card">
          <h4 class="detail-card-title">Agreement Information</h4>
          <div class="detail-items-list">
            <div class="detail-item-new">
              <div class="detail-label-new">Agreement Number</div>
              <div class="detail-value-new">${data.billNumber}</div>
            </div>
            <div class="detail-item-new">
              <div class="detail-label-new">Date of Agreement</div>
              <div class="detail-value-new">${new Date(data.billDate).toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
              })}</div>
            </div>
            <div class="detail-item-new">
              <div class="detail-label-new">Agreement Validity</div>
              <div class="detail-value-new validity-value">${(() => {
                if (data.validity && data.validity.includes(' to ')) {
                  const parts = data.validity.split(' to ');
                  try {
                    const parseDate = (dateStr) => {
                      // Try DD/MM/YYYY format
                      const ddmmyyyy = dateStr.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
                      if (ddmmyyyy) {
                        return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
                      }
                      // Try YYYY-MM-DD format
                      return new Date(dateStr.trim());
                    };
                    
                    const fromDate = parseDate(parts[0]);
                    const toDate = parseDate(parts[1]);
                    
                    if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                      return `${fromDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} to ${toDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
                    }
                  } catch (e) {
                    console.error('Date parsing error:', e);
                  }
                  return data.validity;
                }
                // Fallback: calculate from billDate if validity is just a number or "1 Year" etc
                if (data.validity && !data.validity.includes(' to ')) {
                  const years = parseInt(data.validity) || 1;
                  const startDate = new Date(data.billDate);
                  const endDate = new Date(startDate);
                  endDate.setFullYear(endDate.getFullYear() + years);
                  endDate.setDate(endDate.getDate() - 1);
                  return `${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} to ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
                }
                return data.validity || 'Not specified';
              })()}</div>
            </div>
            <div class="detail-item-new">
              <div class="detail-label-new">Agreement Amount</div>
              <div class="detail-value-new amount-value">₹${data.totalAmount.toLocaleString()}</div>
            </div>
            ${data.serviceCharge && data.serviceCharge > 0 ? `
            <div class="detail-item-new">
              <div class="detail-label-new">Service Charge</div>
              <div class="detail-value-new">₹${data.serviceCharge.toLocaleString()}</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Services Covered and Terms and Conditions -->
      ${data.terms ? (() => {
        const terms = data.terms;
        let servicesSection = '';
        let termsSection = '';
        
        // Split by major sections - more flexible matching
        const servicesMatch = terms.match(/SERVICES COVERED BY THE AGREEMENT\s*\n?([\s\S]*?)(?=⚖️\s*TERMS AND CONDITIONS|Not Covered:|$)/i);
        const termsMatch = terms.match(/⚖️\s*TERMS AND CONDITIONS\s*\n?([\s\S]*?)(?=Not Covered:|$)/i);
        const notCoveredMatch = terms.match(/Not Covered:\s*([\s\S]*?)$/i);
        
        // Helper function to parse lines into list items
        const parseLinesToItems = (content) => {
          return content.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.length > 0)
            .map(line => {
              // Remove leading numbers like "17." or "1."
              line = line.replace(/^\d+\.\s*/, '');
              
              // Skip empty lines and section headers
              if (!line || line.match(/^SERVICES COVERED/i) || line.match(/^⚖️/i)) {
                return null;
              }
              
              // Format as bold label if it has a colon pattern
              const boldMatch = line.match(/^([^:]+):\s*(.*)$/);
              if (boldMatch && boldMatch[2].trim()) {
                return `<li><strong>${sanitizeForTemplate(boldMatch[1].trim())}:</strong> ${sanitizeForTemplate(boldMatch[2].trim())}</li>`;
              }
              // Regular list item
              return `<li>${sanitizeForTemplate(line)}</li>`;
            })
            .filter(item => item !== null)
            .join('');
        };
        
        // Parse Services Covered
        if (servicesMatch) {
          const servicesContent = servicesMatch[1].trim();
          const items = parseLinesToItems(servicesContent);
          
          if (items) {
            servicesSection = `
              <div class="services-section">
                <h3 class="services-title">SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:</h3>
                <ul class="services-list">
                  ${items}
                </ul>
              </div>
            `;
          }
        }
        
        // Parse Terms and Conditions
        if (termsMatch) {
          const termsContent = termsMatch[1].trim();
          const items = parseLinesToItems(termsContent);
          
          if (items) {
            termsSection = `
              <div class="terms-section">
                <h3 class="terms-title">⚖️ TERMS AND CONDITIONS</h3>
                <ul class="terms-list">
                  ${items}
                </ul>
              </div>
            `;
          }
        }
        
        // Handle Not Covered - add to terms section
        if (notCoveredMatch) {
          const notCoveredContent = notCoveredMatch[1].trim();
          if (notCoveredContent) {
            const notCoveredItem = `<li><strong>Not Covered:</strong> ${sanitizeForTemplate(notCoveredContent)}</li>`;
            
            if (termsSection) {
              // Insert before closing </ul>
              termsSection = termsSection.replace('</ul>', `${notCoveredItem}</ul>`);
            } else {
              // Create new terms section
              termsSection = `
                <div class="terms-section">
                  <h3 class="terms-title">⚖️ TERMS AND CONDITIONS</h3>
                  <ul class="terms-list">
                    ${notCoveredItem}
                  </ul>
                </div>
              `;
            }
          }
        }
        
        // If no sections were found, treat entire content as terms
        if (!servicesSection && !termsSection) {
          const allItems = parseLinesToItems(terms);
          if (allItems) {
            termsSection = `
              <div class="terms-section">
                <h3 class="terms-title">TERMS AND CONDITIONS</h3>
                <ul class="terms-list">
                  ${allItems}
                </ul>
              </div>
            `;
          }
        }
        
        return servicesSection + termsSection;
      })() : `
        <!-- Services Covered -->
        <div class="services-section">
          <h3 class="services-title">SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:</h3>
          <ul class="services-list">
            <li><strong>Breakdown Support:</strong> If any breakdown or problem happens with the RO during the AMC period, the company will provide service without extra charges.</li>
            <li><strong>Filters / RO Membrane / Consumables:</strong> Company will clean, repair, or replace filters and parts needed for smooth working.</li>
            <li><strong>Safe RO output:</strong> Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.</li>
            <li><strong>Clean cosmetics and smooth working</strong> of the machine.</li>
            <li><strong>Quick service:</strong> Any breakdown will be resolved within 24 hours.</li>
            <li><strong>Full Care of RO:</strong> The company takes responsibility for complete maintenance and support during the AMC period.</li>
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
            <li><strong>Not Covered:</strong> Display and lights of the RO, RO tap, body, and tank are not covered under this AMC.</li>
          </ul>
        </div>
      `}



      <!-- Additional Notes -->
      ${data.notes ? `
        <div class="agreement-details">
          <h3 class="agreement-details-title">Additional Notes</h3>
          <p>${sanitizeForTemplate(data.notes)}</p>
        </div>
      ` : ''}

      <!-- Signatures -->
      <div class="signatures">
        <div class="signature-box">
          <div class="signature-label">Authorized Signatory</div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">M/s Hydrogen RO</div>
          <img src="/HydrogenROSeal.webp" alt="Hydrogen RO Seal" class="signature-seal" />
          <div class="signature-date">Date: ${new Date().toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          })}</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-logo">
          <span style="color: #2563eb; font-weight: bold;">💧 Hydrogen RO</span>
        </div>
        <p class="footer-text">This is a computer generated document and does not require a physical signature.</p>
        <p class="footer-text">Generated on: ${new Date().toLocaleDateString('en-IN', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        })} | Professional RO Water Purifier Services in Bengaluru</p>
        <p class="footer-text" style="margin-top: 10px;">
          Phone: 8884944288 | Email: mail@hydrogenro.com | Website: hydrogenro.com
        </p>
      </div>
    </body>
    </html>
  `;
}

// Global flag to prevent multiple print operations
let isPrinting = false;

export function generateAMCPDF(
  bill: Bill, 
  action: 'print' | 'pdf' = 'print',
  options?: AMCPDFOptions
): void {
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
      handleMobilePrint(bill, action, options);
      return;
    }
    
    // Try to create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    
    // Check if popup was blocked or failed to open
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      // If popup is blocked, fall back to mobile print method
      console.warn('Popup blocked, falling back to mobile print method');
      // Show a brief toast-style notification instead of alert
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f59e0b;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: 'Poppins', sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;
      notification.textContent = 'Using alternative printing method...';
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
      
      handleMobilePrint(bill, action, options);
      return;
    }
    
    // Popup window opened successfully, proceed with new window method
    const data: AMCPDFData = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      company: bill.company,
      customer: {
        ...bill.customer,
        roModel: (bill.customer as any).roModel || ''
      },
      items: bill.items,
      subtotal: bill.subtotal,
      totalTax: bill.totalTax,
      serviceCharge: bill.serviceCharge,
      totalAmount: bill.totalAmount,
      notes: bill.notes,
      terms: bill.terms,
      validity: bill.validity,
      agreementIntro: bill.agreementIntro
    };
    
    // Write content to new window
    printWindow.document.write(generateAMCHTML(data, options));
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
    console.error('Error generating AMC PDF:', error);
    alert('Error generating AMC Agreement. Please try again.');
    isPrinting = false; // Reset flag on error
  }
}

function handleMobilePrint(
  bill: Bill, 
  action: 'print' | 'pdf',
  options?: AMCPDFOptions
): void {
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
      const styleElement = document.getElementById('amc-print-styles');
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
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
    const data: AMCPDFData = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      company: bill.company,
      customer: {
        ...bill.customer,
        roModel: (bill.customer as any).roModel || ''
      },
      items: bill.items,
      subtotal: bill.subtotal,
      totalTax: bill.totalTax,
      serviceCharge: bill.serviceCharge,
      totalAmount: bill.totalAmount,
      notes: bill.notes,
      terms: bill.terms,
      validity: bill.validity,
      agreementIntro: bill.agreementIntro
    };
    
        // Generate AMC HTML - this is a complete HTML document
    const amcHTML = generateAMCHTML(data, options);
    
    // Parse the HTML to extract body content and styles
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = amcHTML;
    
    // Extract styles from head
    const styleMatch = amcHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const styles = styleMatch ? styleMatch[1] : '';
    
    // Extract body content - find everything between <body> and </body>
    const bodyMatch = amcHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    
    // Inject styles into head
    const styleElement = document.createElement('style');
    styleElement.id = 'amc-print-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
    
    // COMPLETELY REPLACE body HTML with AMC document content (like desktop does with new window)
    // This ensures ONLY the AMC content is visible when print dialog opens
    document.body.innerHTML = bodyContent;
    document.title = `AMC Agreement - ${bill.billNumber}`;
    
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
        window.print();
        // Fallback cleanup in case afterprint doesn't fire (some mobile browsers)
        // Use longer delay - 8 seconds to ensure print is fully captured
        setTimeout(() => {
          if (isPrinting) {
            cleanup();
        }
        }, 8000); // 8 second fallback - ensures print completes before cleanup
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
    
    // Additional safety: keep AMC content visible for at least 10 seconds
    // This ensures mobile browsers have time to capture the content
      setTimeout(() => {
      // Don't cleanup if already cleaned up
      if (isPrinting) {
        // This is just a safety net - cleanup should have happened by now
        console.log('Safety timeout reached - keeping AMC content visible');
      }
    }, 10000);
    }
    
  } catch (error) {
    console.error('Error generating mobile AMC PDF:', error);
    alert('Error generating AMC Agreement. Please try again.');
    cleanup();
    isPrinting = false;
  }
}

