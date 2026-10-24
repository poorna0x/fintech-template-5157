/**
 * Job-assign technician cold template wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function testColdTemplateIsWired() {
  const cold = fs.readFileSync(path.join(root, 'src/lib/whatsappColdTemplates.ts'), 'utf8');
  assert.match(cold, /job_assigned_tech:/);
  assert.match(cold, /svc_job_assigned_tech_v3/);

  const send = fs.readFileSync(path.join(root, 'src/lib/jobTechnicianWhatsApp.ts'), 'utf8');
  assert.match(send, /technicianWantsAssignBackground/);
  assert.match(send, /preferColdTemplate: true/);
  assert.match(send, /WA_COLD\.job_assigned_tech/);
  assert.match(send, /isCustomerServiceWindowClosed/);
  assert.match(send, /fallbackWaMe: false/);

  const prefs = fs.readFileSync(path.join(root, 'src/lib/techWhatsAppPrefs.ts'), 'utf8');
  assert.match(prefs, /job_assign_background/);
  assert.match(prefs, /isTechJobAssignBackgroundOn/);
  assert.match(prefs, /prefs\.job_assign_background = false/);

  const settings = fs.readFileSync(path.join(root, 'src/pages/WhatsAppSettingsPage.tsx'), 'utf8');
  assert.match(settings, /auto_send_job_assign_cold_whatsapp/);

  const templates = fs.readFileSync(path.join(root, 'netlify/functions/whatsapp-templates.js'), 'utf8');
  assert.match(templates, /svc_job_assigned_tech_v3/);

  const submit = fs.readFileSync(
    path.join(root, 'scripts/submit-whatsapp-full-utility.mjs'),
    'utf8'
  );
  assert.match(submit, /svc_job_assigned_tech_v3/);
  assert.match(submit, /--only-job-assign-tech/);

  const fallback = fs.readFileSync(
    path.join(root, 'netlify/functions/whatsapp-cold-fallback.js'),
    'utf8'
  );
  assert.match(fallback, /svc_job_assigned_tech_v2/);
  assert.match(fallback, /job_assigned_tech\|job_unassigned_tech\|tech_customer_photo/);
  assert.match(cold, /svc_job_unassigned_tech_v1/);
  assert.match(send, /job_unassigned_tech/);
  assert.match(send, /Unassign must not open the phone WhatsApp/);
  assert.match(send, /opts\.mode === 'unassign' && !prefs\.autoUnassign/);
  assert.match(submit, /svc_job_unassigned_tech_v1/);

  const payQr = fs.readFileSync(
    path.join(root, 'netlify/functions/whatsapp-pay-qr-helper.js'),
    'utf8'
  );
  assert.match(payQr, /TECH_PAY_QR_TEXT_TEMPLATE = 'svc_job_assigned_tech_v3'/);
  assert.doesNotMatch(payQr, /TECH_PAY_QR_TEXT_TEMPLATE = 'svc_smoke_update'/);
}

testColdTemplateIsWired();
console.log('job-assign-tech-whatsapp.test.cjs ok');
