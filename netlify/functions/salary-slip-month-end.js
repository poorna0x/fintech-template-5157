/**
 * Scheduled: ~9:00 PM IST on days 28–31 only (15:30 UTC, days 28-31 — see netlify.toml).
 * Netlify cron cannot express "last day of month"; this window + IST last-day
 * check is the optimized pattern. On the real last day, WhatsApp salary-slip
 * PDFs to ACTIVE technicians with salary_slip_auto_send = true.
 *
 * Local force-run (dev-server):
 *   POST /.netlify/functions/salary-slip-month-end?force=1&dryRun=1&techId=<uuid>
 *   Optional: &skipDedupe=1  &asLastDay=1
 *   dryRun builds the PDF but does not WhatsApp or set last_sent_month.
 *   force+techId sends that tech even if their toggle is off (test).
 */
'use strict';

const { assertScheduledInvoke } = require('./schedule-guard');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  uploadOutboundPdfToWhatsAppMedia,
  uploadOutboundMediaToCloudinary,
} = require('./whatsapp-helper');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');
const { whatsappGreetingName } = require('./whatsapp-greeting-name');
const { loadMonthSalaryBreakdowns } = require('./salary-slip-month-calc');
const { buildSalarySlipHtml, getSalarySlipFilename } = require('./salary-slip-html');
const {
  recordDocumentPdfAuthenticityServer,
  generateDocumentPdfVerifyCode,
  todayYmdIst,
} = require('./document-pdf-authenticity-record');
const { isPdfCompressionEnabled } = require('./pdf-compression-setting');
// Interactive salary-slip download/send uses generate-pdf (compress on).
// Month-end also compresses when the setting is on, with a short deadline so
// the 26s Lambda still has time to send WhatsApp.
function renderHtmlToPdf(html, requestOrigin, options) {
  return require('./generate-pdf').renderHtmlToPdf(html, requestOrigin, options);
}
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function readQuery(event) {
  const q = event?.queryStringParameters || {};
  const flag = (v) => v === '1' || v === 'true';
  return {
    force: flag(q.force),
    skipDedupe: flag(q.skipDedupe),
    asLastDay: flag(q.asLastDay),
    dryRun: flag(q.dryRun),
    techId: String(q.techId || q.technicianId || '').trim() || null,
  };
}

function istParts(nowMs = Date.now()) {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
  };
}

function isLastCalendarDayIst(nowMs = Date.now()) {
  const { year, month, day } = istParts(nowMs);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay;
}

function daySuffix(day) {
  if (day === 1 || day === 21 || day === 31) return 'st';
  if (day === 2 || day === 22) return 'nd';
  if (day === 3 || day === 23) return 'rd';
  return 'th';
}

function formatSalarySlipPeriodLabel(period) {
  const startDay = Number(
    period.start.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })
  );
  const endDay = Number(
    period.end.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })
  );
  const month = period.start.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  return `${startDay}${daySuffix(startDay)} – ${endDay}${daySuffix(endDay)} ${month}`;
}

function buildSalarySlipWhatsAppCaption(breakdown, period) {
  const periodLabel = formatSalarySlipPeriodLabel(period);
  const net = Number(breakdown.totalSalary || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
  return `Hi ${breakdown.technicianName},

Your salary slip for ${periodLabel} is attached.

Net salary: ₹${net}

Hydrogen RO Team`;
}

function getTechnicianAdminWhatsAppPhone(tech) {
  const wa = String(tech.whatsapp_phone || tech.whatsappPhone || '').trim();
  if (wa) return wa;
  return String(tech.phone || '').trim();
}

function isActiveTechnician(tech) {
  const status = String(tech.account_status || 'ACTIVE').toUpperCase();
  return status === 'ACTIVE' || !tech.account_status;
}

async function sendSalarySlipWhatsAppDocument({
  db,
  creds,
  to,
  pdfBuffer,
  filename,
  caption,
  technicianName,
}) {
  const phone = normalizePhoneE164(to);
  if (!phone) return { ok: false, error: 'Invalid phone' };

  const media = await uploadOutboundPdfToWhatsAppMedia(
    creds.phoneNumberId,
    creds.accessToken,
    pdfBuffer,
    filename
  );
  if (!media?.id) return { ok: false, error: 'Could not upload PDF to WhatsApp' };

  const previewStore = await uploadOutboundMediaToCloudinary(
    pdfBuffer,
    'application/pdf',
    filename
  );

  let sent = await callWhatsAppApi(creds.phoneNumberId, creds.accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'document',
    document: { id: media.id, filename, caption },
  });
  let via = 'document';
  let templateName = null;

  if (!sent.ok) {
    const customerName = whatsappGreetingName(technicianName, 'there');
    const cold = await sendTemplateWithColdFallbacks({
      phoneNumberId: creds.phoneNumberId,
      accessToken: creds.accessToken,
      to: phone,
      templateName: 'svc_doc_salary_hro_v3',
      languageCode: 'en',
      bodyParams: [customerName],
      headerComponents: [
        {
          type: 'header',
          parameters: [{ type: 'document', document: { id: media.id, filename } }],
        },
      ],
      buttonUrlParams: [],
      enableFallback: true,
    });
    if (cold.ok) {
      sent = { ok: true, data: cold.result?.data };
      via = 'cold_template';
      templateName = cold.templateName || 'svc_doc_salary_hro_v3';
    }
  }

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.data?.error?.message || 'WhatsApp send failed',
      meta: sent.data,
    };
  }

  const waMessageId = sent.data?.messages?.[0]?.id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waMessageId,
    direction: 'outbound',
    phone_e164: phone,
    customer_id: null,
    msg_type: via === 'cold_template' ? 'template' : 'document',
    template_name: templateName,
    body:
      via === 'cold_template'
        ? `${templateName}: ${technicianName} · Salary slip`
        : caption,
    media_url: previewStore?.url || previewStore?.ref || null,
    media_mime: 'application/pdf',
    filename,
    status: 'sent',
  });

  return { ok: true, waMessageId, via, templateName };
}

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const query = readQuery(event);
  const force = query.force === true;
  const nowMs = Date.now();

  if (!force && !isLastCalendarDayIst(nowMs) && !query.asLastDay) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: 'not_last_day_ist',
      ist: istParts(nowMs),
    });
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(500, { ok: false, error: 'Supabase service role not configured' });
  }

  const { data: waCrm, error: waCrmErr } = await db
    .from('whatsapp_crm_settings')
    .select('enabled, allow_salary_slip_whatsapp, auto_send_salary_slip_whatsapp')
    .eq('id', 1)
    .maybeSingle();

  if (waCrmErr && !/allow_salary_slip|auto_send_salary_slip|column/i.test(waCrmErr.message || '')) {
    return json(500, { ok: false, error: waCrmErr.message });
  }
  if (waCrm && waCrm.enabled === false) {
    return json(200, { ok: true, skipped: true, reason: 'whatsapp_disabled' });
  }
  if (waCrm && waCrm.allow_salary_slip_whatsapp === false) {
    return json(200, { ok: true, skipped: true, reason: 'salary_slip_whatsapp_off' });
  }
  if (waCrm && waCrm.auto_send_salary_slip_whatsapp === false) {
    return json(200, { ok: true, skipped: true, reason: 'salary_slip_auto_send_off' });
  }

  const { data: settings, error: settingsErr } = await db
    .from('salary_slip_auto_settings')
    .select('id, last_sent_month')
    .eq('id', 1)
    .maybeSingle();

  if (settingsErr) {
    return json(500, { ok: false, error: settingsErr.message });
  }

  const { year, month } = istParts(nowMs);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  if (!force && !query.skipDedupe && settings?.last_sent_month === monthKey) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: 'already_sent',
      monthKey,
    });
  }

  let techQuery = db
    .from('technicians')
    .select(
      'id, full_name, employee_id, phone, whatsapp_phone, account_status, salary, salary_slip_auto_send'
    )
    .limit(200);

  if (query.techId) {
    techQuery = techQuery.eq('id', query.techId);
  } else {
    techQuery = techQuery.eq('salary_slip_auto_send', true);
  }

  const { data: techs, error: techErr } = await techQuery;

  if (techErr) {
    return json(500, { ok: false, error: techErr.message });
  }

  const activeTechs = (techs || []).filter(isActiveTechnician).filter((tech) => {
    if (query.techId && force) return true;
    return tech.salary_slip_auto_send === true;
  });

  if (activeTechs.length === 0) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: query.techId ? 'tech_auto_send_off' : 'no_opted_in_technicians',
      monthKey,
      techId: query.techId || undefined,
    });
  }

  let creds = null;
  if (!query.dryRun) {
    creds = await getWhatsAppCredentials(db);
    if (!creds?.accessToken || !creds?.phoneNumberId) {
      return json(500, { ok: false, error: 'WhatsApp credentials missing' });
    }
  }

  const loaded = await loadMonthSalaryBreakdowns(db, {
    year,
    month,
    technicians: activeTechs,
  });

  const results = {
    monthKey,
    dryRun: query.dryRun === true,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const breakdown of loaded.breakdowns) {
    const tech = activeTechs.find((t) => t.id === breakdown.technicianId);
    const phoneRaw = tech ? getTechnicianAdminWhatsAppPhone(tech) : '';
    const phone = normalizePhoneE164(phoneRaw);
    if (!phone) {
      results.skipped += 1;
      results.details.push({
        technicianId: breakdown.technicianId,
        name: breakdown.technicianName,
        status: 'skipped',
        reason: 'no_phone',
      });
      continue;
    }

    try {
      const verifyCode = generateDocumentPdfVerifyCode();
      const generatedOnYmd = todayYmdIst();
      const html = buildSalarySlipHtml(
        { ...breakdown, authenticityVerifyCode: verifyCode },
        loaded.period,
        true,
        process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://hydrogenro.com'
      );
      const filename = getSalarySlipFilename(breakdown, loaded.period);
      const shouldCompress = await isPdfCompressionEnabled();
      const pdfBuffer = await renderHtmlToPdf(html, process.env.URL || null, {
        compress: shouldCompress,
        filename,
        deadlineAt: Date.now() + 10_000,
      });
      if (!pdfBuffer?.length) {
        throw new Error('PDF generation returned empty buffer');
      }

      const fingerprint = await recordDocumentPdfAuthenticityServer(db, {
        docType: 'salary_slip',
        sourceKey: `salary-slip:${breakdown.technicianId}:${monthKey}`,
        verifyCode,
        pdfBuffer,
        filename,
        documentRef: `${breakdown.technicianName} · ${monthKey}`,
        generatedOnYmd,
      });
      if (!fingerprint.ok) {
        console.warn(
          '[salary-slip-month-end] authenticity fingerprint not saved',
          breakdown.technicianId,
          fingerprint.error
        );
      }

      if (query.dryRun) {
        results.sent += 1;
        results.details.push({
          technicianId: breakdown.technicianId,
          name: breakdown.technicianName,
          status: 'dry_run',
          phone,
          filename,
          pdfBytes: pdfBuffer.length,
          netSalary: breakdown.totalSalary,
          verifyCode,
          authenticityOk: fingerprint.ok === true,
        });
        continue;
      }

      const caption = buildSalarySlipWhatsAppCaption(breakdown, loaded.period);
      const sent = await sendSalarySlipWhatsAppDocument({
        db,
        creds,
        to: phone,
        pdfBuffer,
        filename,
        caption,
        technicianName: breakdown.technicianName,
      });

      if (!sent.ok) {
        results.failed += 1;
        results.details.push({
          technicianId: breakdown.technicianId,
          name: breakdown.technicianName,
          status: 'failed',
          error: sent.error,
        });
        console.warn(
          '[salary-slip-month-end] send failed',
          breakdown.technicianId,
          sent.error
        );
        continue;
      }

      results.sent += 1;
      results.details.push({
        technicianId: breakdown.technicianId,
        name: breakdown.technicianName,
        status: 'sent',
        via: sent.via,
        waMessageId: sent.waMessageId,
        verifyCode,
        authenticityOk: fingerprint.ok === true,
      });
    } catch (err) {
      results.failed += 1;
      const message = err?.message || String(err);
      results.details.push({
        technicianId: breakdown.technicianId,
        name: breakdown.technicianName,
        status: 'failed',
        error: message,
      });
      console.warn('[salary-slip-month-end] tech failed', breakdown.technicianId, message);
    }
  }

  // Dedupe after a real send run. dryRun / skipDedupe leave last_sent_month unchanged.
  if (!query.dryRun && !query.skipDedupe) {
    const { error: markErr } = await db
      .from('salary_slip_auto_settings')
      .update({ last_sent_month: monthKey, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (markErr) {
      console.warn('[salary-slip-month-end] failed to set last_sent_month', markErr.message);
    }
  }

  console.log('[salary-slip-month-end] done', {
    monthKey,
    dryRun: results.dryRun,
    sent: results.sent,
    skipped: results.skipped,
    failed: results.failed,
  });

  return json(200, { ok: true, ...results, loadErrors: loaded.errors });
};

// Exported for unit/smoke tests
exports.isLastCalendarDayIst = isLastCalendarDayIst;
exports.istParts = istParts;
