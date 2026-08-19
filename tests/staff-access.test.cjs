/**
 * Lightweight unit checks for staff-access helpers (no Supabase required).
 * Run: node tests/staff-access.test.cjs
 */
const assert = require('assert');
const {
  technicianCanAccessJob,
  technicianCanAccessCustomer,
  verifyTechnicianAmcSaveAccess,
} = require('../netlify/functions/staff-access');

const TECH = 'tech-1111-1111-1111-111111111111';
const OTHER = 'tech-2222-2222-2222-222222222222';
const JOB = 'job-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CUSTOMER = 'cust-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function mockAdmin(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const state = { filters: [], mode: 'list', limitN: null };

      function filteredRows() {
        return rows.filter((row) =>
          state.filters.every(([col, val]) => {
            if (Array.isArray(val)) return val.includes(row[col]);
            return row[col] === val;
          })
        );
      }

      function resolveList() {
        const matched = filteredRows();
        const data = state.limitN != null ? matched.slice(0, state.limitN) : matched;
        return { data, error: null };
      }

      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.filters.push([col, val]);
          return api;
        },
        in(col, vals) {
          state.filters.push([col, vals]);
          return api;
        },
        limit(n) {
          state.limitN = n;
          return api;
        },
        maybeSingle() {
          state.mode = 'single';
          const match = filteredRows()[0] || null;
          return Promise.resolve({ data: match, error: null });
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(resolveList()).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

async function run() {
  const adminJobAssigned = mockAdmin({
    jobs: [
      {
        id: JOB,
        customer_id: CUSTOMER,
        assigned_technician_id: TECH,
        assigned_by: null,
        completed_by: null,
        team_members: null,
      },
    ],
    job_assignment_requests: [],
  });

  assert.strictEqual(await technicianCanAccessJob(adminJobAssigned, TECH, JOB), true);
  assert.strictEqual(await technicianCanAccessJob(adminJobAssigned, OTHER, JOB), false);

  const adminTeam = mockAdmin({
    jobs: [
      {
        id: JOB,
        customer_id: CUSTOMER,
        assigned_technician_id: OTHER,
        assigned_by: null,
        completed_by: null,
        team_members: [TECH],
      },
    ],
    job_assignment_requests: [],
  });
  assert.strictEqual(await technicianCanAccessJob(adminTeam, TECH, JOB), true);

  const adminCustomer = mockAdmin({
    jobs: [
      {
        id: JOB,
        customer_id: CUSTOMER,
        assigned_technician_id: TECH,
        team_members: null,
      },
    ],
    job_assignment_requests: [],
  });
  assert.strictEqual(await technicianCanAccessCustomer(adminCustomer, TECH, CUSTOMER), true);
  assert.strictEqual(await technicianCanAccessCustomer(adminCustomer, OTHER, CUSTOMER), false);

  const accessOk = await verifyTechnicianAmcSaveAccess(adminJobAssigned, TECH, {
    customerId: CUSTOMER,
    jobId: JOB,
  });
  assert.strictEqual(accessOk.ok, true);

  const accessBadCustomer = await verifyTechnicianAmcSaveAccess(adminJobAssigned, TECH, {
    customerId: 'wrong-customer',
    jobId: JOB,
  });
  assert.strictEqual(accessBadCustomer.ok, false);

  console.log('staff-access.test.js: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
