const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SMOKE,
  buildFallbackAttempts,
} = require('../netlify/functions/whatsapp-cold-fallback');
const {
  resolveWaTemplateName,
} = require('../netlify/functions/whatsapp-template-resolve');

function testDocumentFallbacksKeepPdfHeader() {
  const header = [
    {
      type: 'header',
      parameters: [{ type: 'document', document: { id: 'media-test' } }],
    },
  ];
  const attempts = buildFallbackAttempts(
    'svc_doc_amc_hro_v3',
    ['Rahul'],
    true,
    header
  );
  const names = attempts.map((attempt) => attempt.name);

  assert.deepEqual(names.slice(0, 3), [
    'svc_doc_direct_hro_v1',
    'svc_doc_amc_hro_v2',
    'svc_doc_pdf_v2',
  ]);
  assert.equal(names.includes(SMOKE), false, 'PDF send must never fall back to a text-only template');
  for (const attempt of attempts) {
    assert.deepEqual(
      attempt.headerComponents,
      header,
      `${attempt.name} must keep the DOCUMENT header`
    );
  }
  assert.deepEqual(attempts[0].params, ['Rahul', 'AMC agreement']);
}

function testQuickCustomerColdPrimary() {
  const source = fs.readFileSync(
    path.join(__dirname, '../netlify/functions/whatsapp-booking-start.js'),
    'utf8'
  );
  const block = source.match(
    /if \(action === 'water_filter_service'\) \{([\s\S]*?)\n  \}\n\n  if \(action === 'book_location_photo'\)/
  );
  assert.ok(block, 'water_filter_service cold mapping must exist');
  assert.match(block[1], /coldAskLocFlatPhotoParams\(brand, customerName\)/);
  assert.match(
    block[1],
    /primary:\s*\{\s*\.\.\.locFlatPhoto,\s*seedPending:\s*'water_filter_service'/
  );
  assert.match(source, /existing_service_schedule_\$\{suffix\}_cta_v3/);
  assert.match(source, /unregistered_number_service_\$\{suffix\}_cta_v2/);
  assert.doesNotMatch(source, /name:\s*'svc_ask_location_v2'/);
  assert.match(
    source,
    /function coldAskLocationParams[\s\S]*?name:\s*'svc_ask_location'/
  );
}

function testAskLocationV2FallsBackToApprovedUtility() {
  const attempts = buildFallbackAttempts('svc_ask_location_v2', ['Rahul'], false);
  const askLocation = attempts.find((attempt) => attempt.name === 'svc_ask_location');
  assert.ok(askLocation, 'marketing v2 must fall back to approved svc_ask_location');
  assert.deepEqual(askLocation.params, ['Rahul', 'Water Filter Service']);
  assert.equal(
    attempts.some((attempt) => attempt.name === 'svc_ask_location_v2'),
    false,
    'must never retry MARKETING svc_ask_location_v2'
  );
}

function testAskLocationV3FallsBackToApprovedUtility() {
  const attempts = buildFallbackAttempts(
    'svc_ask_location_v3',
    ['Rahul', 'Eleven RO Water Filter Service'],
    false
  );
  const askLocation = attempts.find((attempt) => attempt.name === 'svc_ask_location');
  assert.ok(askLocation, 'pending v3 must fall back to approved svc_ask_location');
  assert.deepEqual(askLocation.params, ['Rahul', 'Eleven RO Water Filter Service']);
}

function testLocationFallbackParameterCounts() {
  const attempts = buildFallbackAttempts(
    'svc_wfs_ask_loc_flat_photo_ero_v1',
    ['Rahul'],
    false
  );
  const generic = attempts.find(
    (attempt) => attempt.name === 'svc_wfs_ask_loc_flat_photo_v1'
  );
  const askLocation = attempts.find((attempt) => attempt.name === 'svc_ask_location');

  assert.deepEqual(generic?.params, ['Rahul']);
  assert.deepEqual(askLocation?.params, [
    'Rahul',
    'Eleven RO Water Filter Service',
  ]);
}

function testUtilityAliasesResolveToCurrentVersions() {
  assert.equal(resolveWaTemplateName('svc_wfs_hello_hro'), 'svc_wfs_hello_hro_v2');
  assert.equal(resolveWaTemplateName('svc_wfs_just_hi_hro'), 'svc_wfs_just_hi_hro_v3');
  assert.equal(resolveWaTemplateName('quotation_ready'), 'svc_doc_pdf_v2');
}

function testLatestCtasRemainVisible() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/components/whatsapp/WhatsAppQuickRepliesBar.tsx'
    ),
    'utf8'
  );
  for (const name of [
    'reschedule_visit_hro_cta_v2',
    'reschedule_visit_ero_cta_v2',
    'unregistered_number_service_hro_cta_v2',
    'unregistered_number_service_ero_cta_v2',
    'svc_booking_confirmed_letter_hro_v4',
    'svc_booking_confirmed_letter_ero_v4',
  ]) {
    assert.match(source, new RegExp(name));
  }
}

function testKnownClosedWindowSkipsFreeForm() {
  const apiSource = fs.readFileSync(
    path.join(__dirname, '../src/lib/sendAdminWhatsAppApi.ts'),
    'utf8'
  );
  assert.match(
    apiSource,
    /const textResult:[\s\S]*?options\.preferColdTemplate\s*\?\s*\{[\s\S]*?needsWindowOrTemplate:\s*true/
  );

  for (const relativePath of [
    '../src/components/admin/AdminWhatsAppComposer.tsx',
    '../src/lib/callingBulkWhatsApp.ts',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
    assert.match(source, /preferColdTemplate:\s*windowClosed/);
  }
}

function testMissedCallV5FallsBackToV4WithNameOnly() {
  const attempts = buildFallbackAttempts(
    'missed_call_callback_ero_cta_v5',
    ['Rahul', '12 Aug 2026'],
    false
  );
  const v4 = attempts.find((attempt) => attempt.name === 'missed_call_callback_ero_cta_v4');
  assert.ok(v4, 'v5 must fall back to approved v4');
  assert.deepEqual(v4.params, ['Rahul']);
  assert.ok(attempts.some((attempt) => attempt.name === 'svc_missed_call_v3'));
}

testDocumentFallbacksKeepPdfHeader();
testQuickCustomerColdPrimary();
testAskLocationV2FallsBackToApprovedUtility();
testAskLocationV3FallsBackToApprovedUtility();
testLocationFallbackParameterCounts();
testUtilityAliasesResolveToCurrentVersions();
testLatestCtasRemainVisible();
testKnownClosedWindowSkipsFreeForm();
console.log('whatsapp-template-wiring.test.cjs: all checks passed');
