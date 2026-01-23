import { TechnicianSalaryBreakdown } from '@/components/TechnicianPayments';
import { sanitizeForTemplate } from './sanitize';

interface Payment {
  id: string;
  job_id: string;
  bill_amount: number;
  commission_percentage: number;
  commission_amount: number;
  payment_date?: string;
  created_at?: string;
  job?: {
    id: string;
    job_number: string;
  };
}

interface Advance {
  id: string;
  technician_id: string;
  amount: number;
  description?: string;
  reason?: string; // Keep for backward compatibility
  advance_date?: string;
  created_at?: string;
}

interface ExtraCommission {
  id: string;
  technician_id: string;
  amount: number;
  description?: string;
  commission_date?: string;
  created_at?: string;
}

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
  payments: Payment[];
  advances: Advance[];
  extraCommissions: ExtraCommission[];
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
  includeDayWiseBreakdown: boolean;
}

function generateSalarySlipHTML(data: SalarySlipPDFData, includeDayWiseBreakdown: boolean = true): string {
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

  // Calculate payment date: 10th of next month
  // Use start date (1st of month) to avoid date rollover issues when adding months
  const paymentDate = new Date(data.period.start);
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
            border: 2px solid #000000;
          }
          
          @page :first {
            margin: 13mm;
            size: A4;
            border: 2px solid #000000;
          }
          
          @page :left {
            margin: 13mm;
            size: A4;
            border: 2px solid #000000;
          }
          
          @page :right {
            margin: 13mm;
            size: A4;
            border: 2px solid #000000;
          }
          
          body {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
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
          
          .salary-container {
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
          .salary-container > *:first-child {
            margin-top: 0 !important;
          }
          
          /* Add extra spacing to major sections to prevent touching at page breaks */
          .salary-breakdown,
          .holidays-section,
          .info-card {
            margin-top: 8mm !important;
            margin-bottom: 8mm !important;
            page-break-inside: avoid;
            break-inside: avoid;
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

        <!-- Day-wise Job Breakdown -->
        ${includeDayWiseBreakdown && data.payments && data.payments.length > 0 ? `
        <div class="salary-breakdown" style="margin-bottom: 30px;">
          <h3 class="breakdown-title">Day-wise Job Breakdown</h3>
          ${(() => {
            // Group payments by date
            const paymentsByDate = new Map<string, Payment[]>();
            data.payments.forEach((payment: Payment) => {
              // Get date from payment_date or created_at
              const dateStr = payment.payment_date 
                ? payment.payment_date.split('T')[0] 
                : (payment.created_at ? payment.created_at.split('T')[0] : '');
              
              if (dateStr) {
                if (!paymentsByDate.has(dateStr)) {
                  paymentsByDate.set(dateStr, []);
                }
                paymentsByDate.get(dateStr)!.push(payment);
              }
            });
            
            // Sort dates
            const sortedDates = Array.from(paymentsByDate.keys()).sort();
            
            // Generate HTML for each date
            let html = '';
            sortedDates.forEach(dateStr => {
              const payments = paymentsByDate.get(dateStr)!;
              const dateObj = new Date(dateStr + 'T00:00:00');
              const formattedDate = dateObj.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              });
              
              const dayTotalBill = payments.reduce((sum, p) => sum + (p.bill_amount || 0), 0);
              const dayTotalCommission = payments.reduce((sum, p) => sum + (p.commission_amount || 0), 0);
              
              html += `
                <div style="margin-bottom: 20px;">
                  <div style="font-weight: 600; font-size: 14px; color: #374151; margin-bottom: 8px; padding: 8px; background: #f8fafc; border-left: 4px solid #2563eb;">
                    ${formattedDate} - Total: ₹${formatCurrency(dayTotalBill)} | Commission: ₹${formatCurrency(dayTotalCommission)}
                  </div>
                  <table class="breakdown-table" style="margin-bottom: 15px;">
                    <thead>
                      <tr>
                        <th style="width: 20%;">Job Number</th>
                        <th style="width: 25%; text-align: right;">Bill Amount</th>
                        <th style="width: 15%; text-align: right;">Commission %</th>
                        <th style="width: 25%; text-align: right;">Commission Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments.map((payment: Payment) => `
                        <tr>
                          <td>${payment.job?.job_number || payment.job_id.substring(0, 8)}</td>
                          <td style="text-align: right;">₹ ${formatCurrency(payment.bill_amount || 0)}</td>
                          <td style="text-align: right;">${payment.commission_percentage || 10}%</td>
                          <td style="text-align: right;" class="amount-positive">₹ ${formatCurrency(payment.commission_amount || 0)}</td>
                        </tr>
                      `).join('')}
                      <tr style="background-color: #f0f9ff; font-weight: 600;">
                        <td><strong>Day Total</strong></td>
                        <td style="text-align: right;"><strong>₹ ${formatCurrency(dayTotalBill)}</strong></td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;" class="amount-total"><strong>₹ ${formatCurrency(dayTotalCommission)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
            });
            
            return html;
          })()}
          
          ${(() => {
            // Add Advances section at the end
            if (data.advances && data.advances.length > 0) {
              let advancesHtml = `
                <div style="margin-top: 30px; margin-bottom: 20px;">
                  <div style="font-weight: 600; font-size: 16px; color: #374151; margin-bottom: 12px; padding: 8px; background: #fef3c7; border-left: 4px solid #f59e0b;">
                    Advances
                  </div>
                  <table class="breakdown-table">
                    <thead>
                      <tr>
                        <th style="width: 25%;">Date</th>
                        <th style="width: 50%;">Reason</th>
                        <th style="width: 25%; text-align: right;">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${data.advances.map((advance: Advance) => {
                        const advanceDate = advance.advance_date 
                          ? advance.advance_date.split('T')[0] 
                          : (advance.created_at ? advance.created_at.split('T')[0] : '');
                        const dateObj = advanceDate ? new Date(advanceDate + 'T00:00:00') : null;
                        const formattedDate = dateObj ? dateObj.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : 'N/A';
                        
                        return `
                          <tr>
                            <td>${formattedDate}</td>
                            <td>${sanitizeForTemplate(advance.description || advance.reason || 'No reason provided')}</td>
                            <td style="text-align: right;" class="amount-negative">- ₹ ${formatCurrency(advance.amount || 0)}</td>
                          </tr>
                        `;
                      }).join('')}
                      <tr style="background-color: #f0f9ff; font-weight: 600;">
                        <td><strong>Total Advances</strong></td>
                        <td>-</td>
                        <td style="text-align: right;" class="amount-total"><strong>- ₹ ${formatCurrency(data.totalAdvances)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
              return advancesHtml;
            }
            return '';
          })()}
          
          ${(() => {
            // Add Extra Commissions section at the end
            if (data.extraCommissions && data.extraCommissions.length > 0) {
              let extraCommissionsHtml = `
                <div style="margin-top: 30px; margin-bottom: 20px;">
                  <div style="font-weight: 600; font-size: 16px; color: #374151; margin-bottom: 12px; padding: 8px; background: #f3e8ff; border-left: 4px solid #9333ea;">
                    Extra Commissions
                  </div>
                  <table class="breakdown-table">
                    <thead>
                      <tr>
                        <th style="width: 25%;">Date</th>
                        <th style="width: 50%;">Description</th>
                        <th style="width: 25%; text-align: right;">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${data.extraCommissions.map((ec: ExtraCommission) => {
                        const ecDate = ec.commission_date 
                          ? ec.commission_date.split('T')[0] 
                          : (ec.created_at ? ec.created_at.split('T')[0] : '');
                        const dateObj = ecDate ? new Date(ecDate + 'T00:00:00') : null;
                        const formattedDate = dateObj ? dateObj.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : 'N/A';
                        
                        return `
                          <tr>
                            <td>${formattedDate}</td>
                            <td>${sanitizeForTemplate(ec.description || 'No description provided')}</td>
                            <td style="text-align: right;" class="amount-positive">+ ₹ ${formatCurrency(ec.amount || 0)}</td>
                          </tr>
                        `;
                      }).join('')}
                      <tr style="background-color: #f0f9ff; font-weight: 600;">
                        <td><strong>Total Extra Commissions</strong></td>
                        <td>-</td>
                        <td style="text-align: right;" class="amount-total"><strong>+ ₹ ${formatCurrency(data.totalExtraCommission)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
              return extraCommissionsHtml;
            }
            return '';
          })()}
        </div>
        ` : ''}

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
  action: 'print' | 'pdf' = 'pdf',
  includeDayWiseBreakdown: boolean = true
): void {
  try {
    // Prevent multiple simultaneous print operations
    if ((window as any).isPrintingSalarySlip) {
      console.warn('Salary slip generation already in progress');
      return;
    }
    (window as any).isPrintingSalarySlip = true;

    // Get company details (matching AMC generator)
    const companyData = {
      name: 'Authorised Service Franchise',
      address: 'Ground Floor, 13, 4th Main Road, Next To Jain Temple,Seshadripuram, Kumara Park West',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560020',
      phone: '9886944288 & 8884944288',
      email: 'mail@hydrogenro.com',
      gstNumber: '29LIJPS5140P1Z6'
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
      payments: breakdown.payments || [],
      advances: breakdown.advances || [],
      extraCommissions: breakdown.extraCommissions || [],
      company: companyData,
      includeDayWiseBreakdown
    };

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
      if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      console.warn('Popup blocked, falling back to mobile print method');
      handleMobilePrint(pdfData, action, includeDayWiseBreakdown);
      return;
    }

    // Write content to new window
    printWindow.document.write(generateSalarySlipHTML(pdfData, includeDayWiseBreakdown));
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

function handleMobilePrint(data: SalarySlipPDFData, action: 'print' | 'pdf', includeDayWiseBreakdown: boolean = true): void {
  try {
    // Create a temporary div with the salary slip content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = generateSalarySlipHTML(data, includeDayWiseBreakdown);
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
            printWindow.document.write(generateSalarySlipHTML(data, includeDayWiseBreakdown));
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

