/**
 * Commission for a salary month follows job completion, not payment-row created_at.
 */
const assert = require('node:assert/strict');
const { buildSingleMonthSalaryBreakdown } = require('../netlify/functions/salary-slip-month-calc');

function testOldJobPaymentCreatedThisMonthIsIgnored() {
  const techId = 'tech-jyotir';
  const sepJob = {
    id: 'job-sep',
    assigned_technician_id: techId,
    completed_by: techId,
    end_time: '2026-09-10T10:00:00+05:30',
    actual_cost: 10000,
    payment_amount: 10000,
  };
  const result = buildSingleMonthSalaryBreakdown({
    tech: { id: techId, full_name: 'Jyotirling', employee_id: 'TECH1', salary: { baseSalary: 10000 } },
    startDate: new Date(2026, 8, 1, 0, 0, 0, 0),
    endDate: new Date(2026, 8, 30, 23, 59, 59, 999),
    payments: [
      {
        technician_id: techId,
        job_id: 'job-sep',
        commission_amount: 1000,
        created_at: '2026-09-10T04:30:00.000Z',
      },
      {
        technician_id: techId,
        job_id: 'job-nov-2025',
        commission_amount: 875,
        created_at: '2026-09-22T15:49:46.000Z',
      },
    ],
    expenses: [],
    advances: [],
    extraCommissions: [],
    holidays: [],
    completedJobs: [sepJob],
    today: new Date('2026-09-10T12:00:00+05:30'),
  });

  assert.equal(result.totalCommission, 1000);
  assert.equal(result.totalBillAmount, 10000);
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].job_id, 'job-sep');
}

function testMissingPaymentFallsBackToTenPercentOfThisMonthJob() {
  const techId = 'tech-a';
  const result = buildSingleMonthSalaryBreakdown({
    tech: { id: techId, full_name: 'A', employee_id: 'TECHA', salary: { baseSalary: 8000 } },
    startDate: new Date(2026, 8, 1, 0, 0, 0, 0),
    endDate: new Date(2026, 8, 30, 23, 59, 59, 999),
    payments: [],
    expenses: [],
    advances: [],
    extraCommissions: [],
    holidays: [],
    completedJobs: [
      {
        id: 'job-sep-2',
        assigned_technician_id: techId,
        completed_by: techId,
        end_time: '2026-09-05T10:00:00+05:30',
        actual_cost: 4800,
        payment_amount: 4800,
      },
    ],
    today: new Date('2026-09-05T12:00:00+05:30'),
  });

  assert.equal(result.totalCommission, 480);
}

testOldJobPaymentCreatedThisMonthIsIgnored();
testMissingPaymentFallsBackToTenPercentOfThisMonthJob();
console.log('salary-commission-job-end-time.test.cjs ok');
