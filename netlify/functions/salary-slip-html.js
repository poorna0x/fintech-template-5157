/** Server-safe salary slip HTML (from salary-slip-pdf-generator.ts). */
'use strict';

const PRINT_FRAME_CSS = "\n    @page { size: A4 !important; margin: 13mm !important; }\n    html { margin: 0 !important; padding: 0 !important; border: none !important; }\n    body { margin: 0 !important; padding: 0 !important; background: white !important; position: relative !important; }\n    body::before {\n      content: '' !important; position: fixed !important; inset: 0 !important;\n      border: 2px solid #000000 !important; border-radius: 12px !important;\n      pointer-events: none !important; z-index: 9999 !important; box-sizing: border-box !important;\n    }\n";
const SEAL_SRC = '/hydrogenro-seal-sign.webp';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withAbsoluteAssetUrls(html, origin) {
  const base = String(origin || '').trim().replace(/\/$/, '');
  if (!base) return html;
  return html
    .replace(/\bsrc="\//g, 'src="' + base + '/')
    .replace(/\bhref="\//g, 'href="' + base + '/')
    .replace(/\burl\(\//g, 'url(' + base + '/');
}

function getDefaultCompanyData() {
  return {
    name: 'Authorised Service Franchise',
    address: 'Ground Floor, 13, 4th Main Road, Next To Jain Temple,Seshadripuram, Kumara Park West',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560020',
    phone: '9886944288 & 8884944288',
    email: 'mail@hydrogenro.com',
    gstNumber: '29LIJPS5140P1Z6',
  };
}

function generateSalarySlipHTML(data, includeDayWiseBreakdown = true) {
  const formatCurrency = (amount) => {
    return amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  };

  // Payment date: 10th of next month (IST calendar)
  const startParts = data.period.start.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-').map(Number);
  let payY = startParts[0];
  let payM = startParts[1] + 1;
  if (payM > 12) {
    payM = 1;
    payY += 1;
  }
  const paymentDate = new Date(Date.UTC(payY, payM - 1, 10, 12, 0, 0));
  const isRangeSlip = !!(data.monthlyBreakdowns && data.monthlyBreakdowns.length > 0);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Salary Slip - ${data.employeeId} - ${formatMonthYear(data.period.start)}</title>
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
          ${PRINT_FRAME_CSS}

          .salary-container {
            padding-top: 4mm !important;
            padding-bottom: 4mm !important;
            padding-left: 2mm !important;
            padding-right: 2mm !important;
          }
          
          /* Ensure first element respects container padding */
          .salary-container > *:first-child {
            margin-top: 0 !important;
          }

          /* Keep small blocks together, but NEVER force large breakdown sections
             onto the next page (that left page 1 nearly empty). */
          .info-card,
          .holidays-section,
          .signatures,
          .total-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .salary-breakdown {
            page-break-inside: auto;
            break-inside: auto;
            margin-top: 4mm !important;
            margin-bottom: 4mm !important;
          }

          .breakdown-table {
            page-break-inside: auto;
            break-inside: auto;
          }

          .breakdown-table thead {
            display: table-header-group;
          }

          .breakdown-table tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .header {
            margin-top: 0 !important;
            margin-bottom: 6mm !important;
            padding-bottom: 8px !important;
          }

          .document-title {
            margin: 8px 0 !important;
          }

          .salary-info-section {
            margin-bottom: 6mm !important;
          }

          .day-wise-breakdown {
            page-break-before: always;
            break-before: page;
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
              <span class="info-value">${escapeHtml(data.technicianName)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Employee ID:</span>
              <span class="info-value">${data.employeeId}</span>
            </div>
          </div>
          ${!isRangeSlip ? `
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
          ` : ''}
        </div>

        ${data.monthlyBreakdowns && data.monthlyBreakdowns.length > 0 ? `
        <!-- Monthly Range Breakdown -->
        <div class="salary-breakdown">
          <h3 class="breakdown-title">Month-wise Salary Breakdown</h3>
          <table class="breakdown-table">
            <thead>
              <tr>
                <th>Month</th>
                <th style="text-align: right;">Billing</th>
                <th style="text-align: right;">Base + Leaves</th>
                <th style="text-align: right;">Commission</th>
                <th style="text-align: right;">Extra</th>
                <th style="text-align: right;">Before Advance</th>
                <th style="text-align: right;">Advance</th>
                <th style="text-align: right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${data.monthlyBreakdowns.map((month) => `
                <tr>
                  <td>
                    <strong>${month.monthLabel}</strong>
                    <div style="font-size: 10px; color: #6b7280;">
                      Leaves: ${month.totalHolidays} total, ${month.extraHolidays} extra${month.unusedLeaves > 0 ? `, ${month.unusedLeaves} unused` : ''}
                    </div>
                  </td>
                  <td style="text-align: right;">${formatCurrency(month.totalBillAmount)}</td>
                  <td style="text-align: right;">${formatCurrency(month.adjustedBaseSalary)}</td>
                  <td style="text-align: right;" class="amount-positive">${formatCurrency(month.totalCommission)}</td>
                  <td style="text-align: right;" class="amount-positive">
                    ${formatCurrency(month.totalExtraCommission)}
                    ${month.billingSlabCommission > 0 ? `<div style="font-size: 10px; color: #6b7280;">Slab: ${formatCurrency(month.billingSlabCommission)}</div>` : ''}
                  </td>
                  <td style="text-align: right;"><strong>${formatCurrency(month.salaryBeforeAdvance)}</strong></td>
                  <td style="text-align: right;" class="amount-negative">${formatCurrency(month.totalAdvances)}</td>
                  <td style="text-align: right;" class="${month.totalSalary < 0 ? 'amount-negative' : 'amount-positive'}"><strong>${formatCurrency(month.totalSalary)}</strong></td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td><strong>Range Total</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalBillAmount, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.adjustedBaseSalary, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalCommission, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalExtraCommission, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.salaryBeforeAdvance, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalAdvances, 0))}</strong></td>
                <td style="text-align: right;"><strong>${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0))}</strong></td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="padding: 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;">
              <div style="font-size: 11px; color: #6b7280;">Total advance taken in range</div>
              <div style="font-size: 16px; font-weight: 700; color: #c2410c;">₹ ${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalAdvances, 0))}</div>
            </div>
            <div style="padding: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
              <div style="font-size: 11px; color: #6b7280;">Final net salary for range</div>
              <div style="font-size: 16px; font-weight: 700; color: #047857;">₹ ${formatCurrency(data.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0))}</div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Salary Breakdown -->
        <div class="salary-breakdown">
          <h3 class="breakdown-title">${data.monthlyBreakdowns && data.monthlyBreakdowns.length > 0 ? 'Range Total Salary Breakdown' : 'Salary Breakdown'}</h3>
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
                <td><strong>Salary before advance</strong></td>
                <td style="text-align: right;"><strong>₹ ${formatCurrency(data.salaryBeforeAdvance)}</strong></td>
              </tr>
              <tr>
                <td>Advances</td>
                <td style="text-align: right;" class="amount-negative">- ${formatCurrency(data.totalAdvances)}</td>
              </tr>
              <tr class="total-row">
                <td><strong>Net Salary</strong></td>
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
            <img src="${SEAL_SRC}" alt="Hydrogen RO Seal" class="signature-seal" />
            <div class="signature-date">Date: ${formatDate(paymentDate)}</div>
          </div>
        </div>

        <!-- Day-wise Job Breakdown -->
        ${includeDayWiseBreakdown && data.payments && data.payments.length > 0 ? `
        <div class="salary-breakdown day-wise-breakdown" style="margin-bottom: 30px;">
          <h3 class="breakdown-title">Day-wise Job Breakdown</h3>
          ${(() => {
            // Group payments by date
            const paymentsByDate = new Map();
            data.payments.forEach((payment) => {
              // Get date from payment_date or created_at
              const dateStr = payment.payment_date 
                ? payment.payment_date.split('T')[0] 
                : (payment.created_at ? payment.created_at.split('T')[0] : '');
              
              if (dateStr) {
                if (!paymentsByDate.has(dateStr)) {
                  paymentsByDate.set(dateStr, []);
                }
                paymentsByDate.get(dateStr).push(payment);
              }
            });
            
            // Sort dates
            const sortedDates = Array.from(paymentsByDate.keys()).sort();
            
            // Generate HTML for each date
            let html = '';
            sortedDates.forEach(dateStr => {
              const payments = paymentsByDate.get(dateStr);
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
                      ${payments.map((payment) => `
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
              const advancesHtml = `
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
                      ${data.advances.map((advance) => {
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
                            <td>${escapeHtml(advance.description || advance.reason || 'No reason provided')}</td>
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
            if ((data.extraCommissions && data.extraCommissions.length > 0) || (data.billingSlabCommission || 0) > 0) {
              const extraCommissionsHtml = `
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
                      ${(data.billingSlabCommission || 0) > 0 ? `
                        <tr>
                          <td>Auto</td>
                          <td>Billing slab bonus</td>
                          <td style="text-align: right;" class="amount-positive">+ ₹ ${formatCurrency(data.billingSlabCommission || 0)}</td>
                        </tr>
                      ` : ''}
                      ${data.extraCommissions.map((ec) => {
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
                            <td>${escapeHtml(ec.description || 'No description provided')}</td>
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

        <!-- Footer -->
        <div class="footer">
          <div>This is a computer-generated salary slip.</div>
          <div style="margin-top: 5px;">💧 <span style="color: #2563eb; font-weight: bold;">Hydrogen RO</span> - Authorized Service Provider</div>
          ${data.authenticityVerifyCode ? `
          <div style="margin-top: 8px; font-size: 11px; color: #4b5563;">
            ${escapeHtml('Verify authenticity at hydrogenro.com/authenticity · Code ' + data.authenticityVerifyCode)}
          </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}


function buildSalarySlipHtml(breakdown, period, includeDayWiseBreakdown, assetOrigin) {
  const data = {
    technicianName: breakdown.technicianName,
    employeeId: breakdown.employeeId,
    period,
    baseSalary: breakdown.baseSalary,
    periodBaseSalary: breakdown.periodBaseSalary,
    adjustedBaseSalary: breakdown.adjustedBaseSalary,
    totalCommission: breakdown.totalCommission,
    totalExtraCommission: breakdown.totalExtraCommission,
    billingSlabCommission: breakdown.billingSlabCommission,
    totalExpenses: breakdown.totalExpenses,
    totalAdvances: breakdown.totalAdvances,
    totalHolidays: breakdown.totalHolidays,
    allowedHolidays: breakdown.allowedHolidays,
    extraHolidays: breakdown.extraHolidays,
    unusedLeaves: breakdown.unusedLeaves,
    unusedLeaveBonus: breakdown.unusedLeaveBonus,
    holidayDeduction: breakdown.holidayDeduction,
    salaryBeforeAdvance: breakdown.salaryBeforeAdvance,
    totalSalary: breakdown.totalSalary,
    totalBillAmount: breakdown.totalBillAmount,
    payments: breakdown.payments || [],
    advances: breakdown.advances || [],
    extraCommissions: breakdown.extraCommissions || [],
    monthlyBreakdowns: breakdown.monthlyBreakdowns || [],
    company: getDefaultCompanyData(),
    includeDayWiseBreakdown: includeDayWiseBreakdown !== false,
    authenticityVerifyCode: breakdown.authenticityVerifyCode || null,
  };
  const html = generateSalarySlipHTML(data, includeDayWiseBreakdown !== false);
  const origin =
    assetOrigin ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.VITE_PDF_ASSET_ORIGIN ||
    'https://hydrogenro.com';
  return withAbsoluteAssetUrls(html, origin);
}

function getSalarySlipFilename(breakdown, period) {
  const name = String(breakdown.technicianName || 'Technician').replace(/\s+/g, '_');
  let day = '';
  if (period?.start instanceof Date) {
    const d = period.start;
    day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } else {
    day = String(period?.start || '').slice(0, 10);
  }
  return 'SalarySlip_' + name + '_' + day + '.pdf';
}

module.exports = {
  generateSalarySlipHTML,
  buildSalarySlipHtml,
  getSalarySlipFilename,
  withAbsoluteAssetUrls,
  getDefaultCompanyData,
};
