import { TechnicianSalaryBreakdown } from '@/components/TechnicianPayments';
import { sanitizeForTemplate } from './sanitize';

interface SalarySlipPDFData {
  technicianName: string;
  employeeId: string;
  period: {
    start: Date;
    end: Date;
  };
  baseSalary: number;
  periodBaseSalary: number;
  adjustedBaseSalary: number;
  totalCommission: number;
  totalExtraCommission: number;
  totalExpenses: number;
  totalAdvances: number;
  totalHolidays: number;
  allowedHolidays: number;
  extraHolidays: number;
  unusedLeaves: number;
  unusedLeaveBonus: number;
  holidayDeduction: number;
  totalSalary: number;
  totalBillAmount: number;
  company: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber?: string;
  };
}

function generateSalarySlipHTML(data: SalarySlipPDFData): string {
  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const paymentDate = new Date(data.period.end);
  paymentDate.setMonth(paymentDate.getMonth() + 1);
  paymentDate.setDate(10);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Salary Slip - ${data.employeeId}</title>
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
          width: 210mm;
          min-height: 297mm;
          max-width: 210mm;
          box-sizing: border-box;
        }
        
        .salary-container {
          width: 100%;
          max-width: 100%;
          margin: 0;
          background: white;
          padding: 20mm 15mm 20mm 15mm;
          overflow: visible;
          border-radius: 12px;
          box-sizing: border-box;
        }
        
        @media print {
          @page {
            margin: 13mm;
            size: A4;
          }
          
          body {
            padding: 0 !important;
            margin: 0 !important;
            border: 2px solid #000000 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            box-sizing: border-box !important;
          }
          
          .salary-container {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding-top: 10mm !important;
            padding-bottom: 10mm !important;
            padding-left: 5mm !important;
            padding-right: 5mm !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
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
          text-transform: uppercase;
        }
        
        .salary-info-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .info-card {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #000000;
        }
        
        .info-card-title {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .info-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
        }
        
        .info-label {
          font-weight: 500;
          color: #666;
        }
        
        .info-value {
          font-weight: 600;
          color: #000;
        }
        
        .salary-breakdown {
          margin-bottom: 30px;
        }
        
        .breakdown-title {
          font-size: 18px;
          font-weight: bold;
          color: #000000;
          margin-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 5px;
        }
        
        .breakdown-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        .breakdown-table th {
          background-color: #f8fafc;
          color: #374151;
          font-weight: 600;
          padding: 12px;
          text-align: left;
          border: 1px solid #d1d5db;
          font-size: 13px;
        }
        
        .breakdown-table td {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          font-size: 13px;
        }
        
        .breakdown-table tr:nth-child(even) {
          background-color: #f9fafb;
        }
        
        .amount-positive {
          color: #059669;
          font-weight: 600;
        }
        
        .amount-negative {
          color: #dc2626;
          font-weight: 600;
        }
        
        .amount-total {
          color: #000000;
          font-weight: 700;
          font-size: 15px;
        }
        
        .total-row {
          background-color: #f0f9ff !important;
          border-top: 2px solid #000000;
          border-bottom: 2px solid #000000;
        }
        
        .holidays-section {
          background: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid #f59e0b;
        }
        
        .holidays-title {
          font-size: 14px;
          font-weight: 600;
          color: #92400e;
          margin-bottom: 10px;
        }
        
        .holidays-info {
          font-size: 13px;
          color: #78350f;
        }
        
        .signatures {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        
        .signature-box {
          text-align: center;
          flex: 1;
          padding: 0 20px;
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
        
        .signature-line {
          border-top: 2px solid #000;
          margin: 40px auto 5px auto;
          width: 200px;
        }
        
        .signature-date {
          font-size: 12px;
          color: #6b7280;
          margin-top: 5px;
        }
        
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="salary-container">
        <!-- Header -->
        <div class="header">
          <div class="logo-container">
            <img src="/fulllogo.webp" alt="Hydrogenro Logo" class="full-logo" />
          </div>
          <div class="company-details">
            <div>${data.company.address}, ${data.company.city} - ${data.company.pincode}</div>
            <div>Phone: ${data.company.phone} | Email: ${data.company.email}</div>
            ${data.company.gstNumber ? `<div>GST: ${data.company.gstNumber}</div>` : ''}
          </div>
          <h2 class="document-title">Salary Slip</h2>
        </div>

        <!-- Employee & Period Information -->
        <div class="salary-info-section">
          <div class="info-card">
            <div class="info-card-title">Employee Information</div>
            <div class="info-item">
              <span class="info-label">Employee Name:</span>
              <span class="info-value">${sanitizeForTemplate(data.technicianName)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Employee ID:</span>
              <span class="info-value">${data.employeeId}</span>
            </div>
          </div>
          
          <div class="info-card">
            <div class="info-card-title">Salary Period</div>
            <div class="info-item">
              <span class="info-label">Period:</span>
              <span class="info-value">${formatDate(data.period.start)} to ${formatDate(data.period.end)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Payment Date:</span>
              <span class="info-value">${formatDate(paymentDate)}</span>
            </div>
          </div>
        </div>

        <!-- Salary Breakdown -->
        <div class="salary-breakdown">
          <h3 class="breakdown-title">Salary Breakdown</h3>
          <table class="breakdown-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Base Salary (Monthly)</td>
                <td style="text-align: right;">${formatCurrency(data.baseSalary)}</td>
              </tr>
              <tr>
                <td>Base Salary (Period)</td>
                <td style="text-align: right;">${formatCurrency(data.periodBaseSalary)}</td>
              </tr>
              ${data.holidayDeduction > 0 ? `
              <tr>
                <td>Leave Deduction (${data.extraHolidays} absent days)</td>
                <td style="text-align: right;" class="amount-negative">- ${formatCurrency(data.holidayDeduction)}</td>
              </tr>
              ` : ''}
              ${data.unusedLeaveBonus > 0 ? `
              <tr>
                <td>Unused Leave Bonus (${data.unusedLeaves} unused leaves)</td>
                <td style="text-align: right;" class="amount-positive">+ ${formatCurrency(data.unusedLeaveBonus)}</td>
              </tr>
              ` : ''}
              <tr>
                <td><strong>Adjusted Base Salary</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.adjustedBaseSalary)}</strong></td>
              </tr>
              <tr>
                <td>Commission (Variable % per job)</td>
                <td style="text-align: right;" class="amount-positive">+ ${formatCurrency(data.totalCommission)}</td>
              </tr>
              <tr>
                <td>Extra Commission</td>
                <td style="text-align: right;" class="amount-positive">+ ${formatCurrency(data.totalExtraCommission)}</td>
              </tr>
              <tr>
                <td>Advances</td>
                <td style="text-align: right;" class="amount-negative">- ${formatCurrency(data.totalAdvances)}</td>
              </tr>
              <tr class="total-row">
                <td><strong>Total Salary</strong></td>
                <td style="text-align: right;" class="amount-total"><strong>₹ ${formatCurrency(data.totalSalary)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Holidays Information -->
        <div class="holidays-section">
          <div class="holidays-title">Leave Information</div>
          <div class="holidays-info">
            <div>Total Leaves: ${data.totalHolidays} days</div>
            <div>Allowed Leaves: ${data.allowedHolidays} days</div>
            ${data.extraHolidays > 0 ? `<div>Extra Leaves (Absent): ${data.extraHolidays} days</div>` : ''}
            ${data.unusedLeaves > 0 ? `<div>Unused Leaves: ${data.unusedLeaves} days (Bonus: ₹${formatCurrency(data.unusedLeaveBonus)})</div>` : ''}
          </div>
        </div>

        <!-- Performance Summary -->
        <div class="info-card" style="margin-bottom: 20px;">
          <div class="info-card-title">Performance Summary</div>
          <div class="info-item">
            <span class="info-label">Total Billing:</span>
            <span class="info-value">₹ ${formatCurrency(data.totalBillAmount)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Total Commission:</span>
            <span class="info-value">₹ ${formatCurrency(data.totalCommission)}</span>
          </div>
          ${data.totalExpenses > 0 ? `
          <div class="info-item">
            <span class="info-label">Total Expenses:</span>
            <span class="info-value">₹ ${formatCurrency(data.totalExpenses)}</span>
          </div>
          ` : ''}
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="signature-box">
            <div class="signature-label">Employee Signature</div>
            <div class="signature-line"></div>
            <div class="signature-date">Date: ${formatDate(paymentDate)}</div>
          </div>
          
          <div class="signature-box">
            <div class="signature-label">Authorized Signatory</div>
            <img src="/HydrogenROSeal.webp" alt="Hydrogen RO Seal" class="signature-seal" />
            <div class="signature-date">Date: ${formatDate(paymentDate)}</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div>This is a computer-generated salary slip.</div>
          <div style="margin-top: 5px;">💧 <span style="color: #2563eb; font-weight: bold;">Hydrogen RO</span> - Authorized Service Provider</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateSalarySlipPDF(
  breakdown: TechnicianSalaryBreakdown,
  period: { start: Date; end: Date },
  action: 'print' | 'pdf' = 'pdf'
): void {
  try {
    // Prevent multiple simultaneous print operations
    if ((window as any).isPrintingSalarySlip) {
      console.warn('Salary slip generation already in progress');
      return;
    }
    (window as any).isPrintingSalarySlip = true;

    // Get company details (you may want to load this from settings/config)
    const companyData = {
      name: 'Hydrogen RO',
      address: 'Your Company Address',
      city: 'Your City',
      state: 'Your State',
      pincode: 'Your Pincode',
      phone: 'Your Phone',
      email: 'Your Email',
      gstNumber: 'Your GST Number'
    };

    // Try to get company details from localStorage or config
    try {
      const storedCompany = localStorage.getItem('companyDetails');
      if (storedCompany) {
        const parsed = JSON.parse(storedCompany);
        Object.assign(companyData, parsed);
      }
    } catch (e) {
      console.warn('Could not load company details from storage');
    }

    const pdfData: SalarySlipPDFData = {
      technicianName: breakdown.technicianName,
      employeeId: breakdown.employeeId,
      period,
      baseSalary: breakdown.baseSalary,
      periodBaseSalary: breakdown.periodBaseSalary,
      adjustedBaseSalary: breakdown.adjustedBaseSalary,
      totalCommission: breakdown.totalCommission,
      totalExtraCommission: breakdown.totalExtraCommission,
      totalExpenses: breakdown.totalExpenses,
      totalAdvances: breakdown.totalAdvances,
      totalHolidays: breakdown.totalHolidays,
      allowedHolidays: breakdown.allowedHolidays,
      extraHolidays: breakdown.extraHolidays,
      unusedLeaves: breakdown.unusedLeaves,
      unusedLeaveBonus: breakdown.unusedLeaveBonus,
      holidayDeduction: breakdown.holidayDeduction,
      totalSalary: breakdown.totalSalary,
      totalBillAmount: breakdown.totalBillAmount,
      company: companyData
    };

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      console.warn('Popup blocked, falling back to mobile print method');
      handleMobilePrint(pdfData, action);
      return;
    }

    // Write content to new window
    printWindow.document.write(generateSalarySlipHTML(pdfData));
    printWindow.document.close();

    // Wait for content to load, then trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          if (action === 'print') {
            printWindow.print();
          } else {
            printWindow.print(); // Browser will show save as PDF option
          }
          
          // Cleanup after print
          setTimeout(() => {
            (window as any).isPrintingSalarySlip = false;
            printWindow.close();
          }, 1000);
        } catch (printError) {
          console.error('Error during print:', printError);
          (window as any).isPrintingSalarySlip = false;
          printWindow.close();
        }
      }, 500);
    };

    // Fallback if onload doesn't fire
    setTimeout(() => {
      if ((window as any).isPrintingSalarySlip) {
        try {
          if (action === 'print') {
            printWindow.print();
          } else {
            printWindow.print();
          }
          setTimeout(() => {
            (window as any).isPrintingSalarySlip = false;
            printWindow.close();
          }, 1000);
        } catch (e) {
          (window as any).isPrintingSalarySlip = false;
        }
      }
    }, 2000);

  } catch (error) {
    console.error('Error generating salary slip PDF:', error);
    alert('Error generating salary slip. Please try again.');
    (window as any).isPrintingSalarySlip = false;
  }
}

function handleMobilePrint(data: SalarySlipPDFData, action: 'print' | 'pdf'): void {
  try {
    // Create a temporary div with the salary slip content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = generateSalarySlipHTML(data);
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '210mm';
    document.body.appendChild(tempDiv);

    // Wait for images to load
    const images = tempDiv.querySelectorAll('img');
    let imagesLoaded = 0;
    const totalImages = images.length;

    const triggerPrint = () => {
      setTimeout(() => {
        try {
          // Create print window
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(generateSalarySlipHTML(data));
            printWindow.document.close();
            
            setTimeout(() => {
              printWindow.print();
              setTimeout(() => {
                printWindow.close();
                document.body.removeChild(tempDiv);
                (window as any).isPrintingSalarySlip = false;
              }, 1000);
            }, 500);
          } else {
            document.body.removeChild(tempDiv);
            (window as any).isPrintingSalarySlip = false;
            alert('Please allow popups to generate salary slip');
          }
        } catch (printError) {
          console.error('Error during print:', printError);
          document.body.removeChild(tempDiv);
          (window as any).isPrintingSalarySlip = false;
        }
      }, 500);
    };

    if (totalImages === 0) {
      triggerPrint();
    } else {
      images.forEach((img) => {
        if (img.complete) {
          imagesLoaded++;
          if (imagesLoaded === totalImages) {
            triggerPrint();
          }
        } else {
          img.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
              triggerPrint();
            }
          };
          img.onerror = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
              triggerPrint();
            }
          };
        }
      });

      // Fallback timeout
      setTimeout(() => {
        if ((window as any).isPrintingSalarySlip) {
          triggerPrint();
        }
      }, 3000);
    }
  } catch (error) {
    console.error('Error in mobile print:', error);
    (window as any).isPrintingSalarySlip = false;
    alert('Error generating salary slip. Please try again.');
  }
}

