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
  assert.match(cold, /svc_job_assigned_tech_v2/);

  const send = fs.readFileSync(path.join(root, 'src/lib/jobTechnicianWhatsApp.ts'), 'utf8');
  assert.match(send, /prefs\.autoAssignCold/);
  assert.match(send, /preferColdTemplate: true/);
  assert.match(send, /WA_COLD\.job_assigned_tech/);

  const settings = fs.readFileSync(path.join(root, 'src/pages/WhatsAppSettingsPage.tsx'), 'utf8');
  assert.match(settings, /auto_send_job_assign_cold_whatsapp/);

  const templates = fs.readFileSync(path.join(root, 'netlify/functions/whatsapp-templates.js'), 'utf8');
  assert.match(templates, /svc_job_assigned_tech_v2/);

  const submit = fs.readFileSync(
    path.join(root, 'scripts/submit-whatsapp-full-utility.mjs'),
    'utf8'
  );
  assert.match(submit, /svc_job_assigned_tech_v2/);
  assert.match(submit, /--only-job-assign-tech/);
}

testColdTemplateIsWired();
console.log('job-assign-tech-whatsapp.test.cjs ok');
