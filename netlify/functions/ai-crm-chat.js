/**
 * Full-admin CRM AI chat.
 * Searches bounded CRM rows server-side and returns answers + reviewed action drafts.
 * Never mutates CRM data, never sends WhatsApp, never runs SQL from the model.
 *
 * POST /.netlify/functions/ai-crm-chat
 * Body: { message, focusCustomerId?, conversationId? }
 */

const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { readBearerToken, verifyFullAdminBearerToken } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const { getAiAssistantConfig, publicConfigSummary } = require('./ai-config');
const { generateWithProvider, describeProviderRateLimit } = require('./ai-provider');
const { parseCrmChatRequest, normalizeCrmChatOutput, assertNoMutationTools } = require('./ai-crm-schemas');
const {
  lookupCrmContext,
  formatContextForPrompt,
  formatLiveOpsAnswer,
  publicLiveOpsSnapshot,
  formatStatsAnswerForTools,
  extractQuickPaymentAmount,
  isQuickPaymentQrGenerationRequest,
  isQuickPaymentQrSendRequest,
  extractQueryHints,
  AI_READONLY_SCHEMA,
  runReadonlyQuery,
} = require('./ai-crm-lookup');
const {
  CRM_PLANNER_SCHEMA,
  plannerSystemInstruction,
  normalizePlannerOutput,
  buildPlannerMessages,
  buildAllowlistedLookupQuery,
  visibleEntitiesForTools,
  augmentPlanTools,
  inferDeterministicPlan,
  coerceCustomerPaymentQrPlan,
  inferUniversalCrmPlan,
} = require('./ai-crm-planner');
const { sha256, localDayKey, claimAiQuota, finalizeAiInvocation } = require('./ai-audit');

const MAX_BODY_BYTES = 10_000;

const CRM_CHAT_SCHEMA = {
  type: 'object',
  required: ['answer', 'confidence', 'requiresHuman', 'warnings', 'proposedActions'],
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' },
    requiresHuman: { type: 'boolean' },
    warnings: { type: 'array', items: { type: 'string' } },
    proposedActions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'requiresConfirm', 'payload'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'open_customer',
              'create_customer',
              'create_customer_and_job',
              'edit_customer',
              'create_job',
              'schedule_follow_up',
              'create_reminder',
              'open_app',
              'open_document_draft',
              'open_job',
              'open_customer_composer',
              'send_payment_qr',
            ],
          },
          label: { type: 'string' },
          confidence: { type: 'number' },
          requiresConfirm: { type: 'boolean' },
          // Explicit properties: structured-output models drop keys that the
          // schema does not name, which would strip customerId/jobId.
          payload: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              jobId: { type: 'string' },
              target: { type: 'string' },
              documentType: { type: 'string' },
              instruction: { type: 'string' },
              mode: { type: 'string' },
              channel: { type: 'string' },
              template: { type: 'string' },
              fullName: { type: 'string' },
              phone: { type: 'string' },
              alternatePhone: { type: 'string' },
              email: { type: 'string' },
              address: { type: 'string' },
              visibleAddress: { type: 'string' },
              googleLocation: { type: 'string' },
              brand: { type: 'string' },
              model: { type: 'string' },
              serviceType: { type: 'string' },
              serviceSubType: { type: 'string' },
              scheduledDate: { type: 'string' },
              scheduledTimeSlot: { type: 'string' },
              scheduledTimeCustom: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'string' },
              leadSource: { type: 'string' },
              notes: { type: 'string' },
              followUpDate: { type: 'string' },
              followUpTime: { type: 'string' },
              followUpReason: { type: 'string' },
              addAmcReminder: { type: 'boolean' },
              title: { type: 'string' },
              reminderAt: { type: 'string' },
              patch: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  alternatePhone: { type: 'string' },
                  email: { type: 'string' },
                  address: { type: 'string' },
                  visibleAddress: { type: 'string' },
                  googleLocation: { type: 'string' },
                  brand: { type: 'string' },
                  model: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: {
      ...headers,
      'Cache-Control': 'no-store, private',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function buildSystemInstruction() {
  return [
    'You are an admin CRM assistant for HydrogenRO / ElevenRO.',
    'Answer using ONLY the provided CRM lookup facts. Never invent customers, jobs, amounts, or dates.',
    'If the facts include an exact customer-code or phone match, never claim that target was not found. Associate listed documents and jobs with that matched customer.',
    'Conversation history explains references such as "those" or "last month", but it is not current CRM evidence. For the current answer, never reuse a count, amount, row, or date from an earlier assistant reply unless the current CRM lookup facts provide it again.',
    'The facts include today\'s IST date, exact counts, and capped lists. Use the exact counts for "how many" and totals; never count the rows in a list yourself, because lists are truncated.',
    'For revenue/collection facts, follow completedJobValueBasis exactly. Billed basis includes unpaid work. Confirmed-paid basis includes completed jobs currently marked PAID by completion date, but is still not a cash-transaction ledger.',
    'Expense totals come from business_expenses and technician_expenses. Keep the two types separate, and quote the combined total only when useful. Do not call revenue minus these two totals net profit because other costs may exist.',
    'If an expense source is marked unavailable, say that its data could not be loaded; never turn an unavailable source into zero.',
    'For customer value rankings, preserve the authoritative rank order. "confirmedFullyPaidINR" counts only completed jobs marked PAID; "completedJobBilledINR" can include unpaid or partially paid work. State both when useful and never call billed value collected cash.',
    'For technician billing rankings, preserve the authoritative rank order and call the amount completed-job billing, not cash collected or technician salary. Answer the requested period only.',
    'When the facts contain a "Largest single completed job" line and the question asks for the highest billing for one customer or one job, answer with that job and customer, not the technician or customer total.',
    'Never add up amounts yourself: only quote money totals that appear in the exact counts section, or the individual amounts shown on a row.',
    'When asked what a period will end at, quote the straight-line projection line if present and call it an estimate at the current run rate. Do not refuse a forecast when that fact exists, and never invent one when it is absent.',
    'When asked how a period compares with before, use the same-length previous period line. Never compute your own percentage.',
    'Only say you searched for a name when the facts show a spelling note or customer rows; otherwise say the question did not include a name you could look up.',
    'When the facts contain jobs, reminders, payments or counts, summarise them directly instead of saying nothing was found.',
    'Reminder facts explicitly exclude pending-payment reminders. Never rename non-payment reminders as payment reminders; payment-reminder questions use the payments facts.',
    'Only say no records were found when the relevant fact sections are empty or zero.',
    'Return ONLY JSON with keys: answer, confidence (0-1), requiresHuman (boolean), warnings (string[]), proposedActions (array).',
    'proposedActions types are limited to: open_customer, create_customer, create_customer_and_job, edit_customer, create_job, schedule_follow_up, create_reminder, open_app, open_document_draft, open_job, open_customer_composer, send_payment_qr.',
    'Every proposed action MUST set requiresConfirm=true. Drafts only open normal CRM forms for admin review.',
    'Propose create, edit, job, follow-up, or reminder actions only when the user explicitly asks to perform or draft that action. A lookup such as "AMC expiring soon" must not invent reminder drafts.',
    'Use open_app when the admin asks to open, go to, show, manage, configure, or edit an app screen/settings area. payload.target MUST be one of: dashboard, ongoing_jobs, completed_jobs, followup_jobs, payments, billing, analytics, inventory, gst_invoices, amc_contracts, letterhead_documents, settings, dashboard_settings, whatsapp_inbox, whatsapp_settings, calling, reminders, pending_payments, recurring_service, advanced_search, warranty, privacy_center, pdf_authenticity, ai_usage, database_storage, direct_sale, lead_catalog, job_reviews, technicians, technician_locations, todo_tasks, payment_qr, quick_upi_qr, product_qr, data_export, app_lock, recent_accounts, quick_customer, amount_trackers, sent_email_log, measure_distance, arrange_visit_order, nearby_jobs, technician_live_location, message_technician. Use dashboard_settings for PDF compression, follow-up glow, non-AMC follow-up count, or job-assignment WhatsApp preferences. Use ai_usage for AI provider/model selection and usage statistics. Never invent a URL or target.',
    'Use open_document_draft when the admin asks to draft/open/prepare a quotation, service bill, tax invoice, AMC, or warranty for a looked-up customer. payload must contain documentType (quotation|service_bill|tax_invoice|amc|warranty), the looked-up customerId, and instruction copied from the user request. This opens the normal document form and carries the instruction into its AI editor; it never generates, sends, downloads, or saves automatically.',
    'Use open_job for a looked-up job when the admin asks to view details, edit, assign, reassign, complete, or schedule a follow-up. payload must contain the looked-up jobId and mode (details|edit|assign|reassign|complete|follow_up). It only opens the existing CRM review form.',
    'Do not propose assign, reassign, or complete for a job already marked COMPLETED. Explain that it is already completed; viewing details or scheduling a follow-up may still be offered.',
    'Use open_customer_composer when the admin asks to write, draft, compose, email, or WhatsApp a looked-up customer. payload must contain customerId, channel (whatsapp|email), and template (general|pending_payment|service_reminder|quotation|invoice). It opens a composer but never sends.',
    'A proposed action has not happened yet. Say it is ready and tell the admin to tap the action button; never claim that you already opened, prepared, saved, sent, or changed something.',
    'Use create_customer when the admin asks to add a new customer. Copy only supplied name, phone, email, address, visible location label, Google Maps link, RO/softener type, brand, model and notes. Never invent missing values.',
    'Use create_customer_and_job when the admin explicitly asks for both a new customer and a job. Include the customer fields plus the job fields.',
    'A new-customer draft may omit phone, but warn that the CRM form requires it before saving.',
    'Use edit_customer only for a looked-up customerId. Put only explicitly requested changed fields inside payload.patch. Never clear unspecified fields.',
    'For create_job / create_reminder, payload.customerId must match a looked-up customer.',
    'create_job dates use YYYY-MM-DD. scheduledTimeSlot must be MORNING, AFTERNOON, EVENING, FLEXIBLE or CUSTOM; for an exact time use CUSTOM plus scheduledTimeCustom in 24h HH:MM.',
    'For schedule_follow_up, payload.jobId must match a looked-up job.',
    'If an existing customer/job is ambiguous, ask a clarifying question. New-customer actions do not need an existing customerId.',
    'Never claim you created, updated, deleted, emailed, or WhatsApped anything. Drafts only.',
    'Never print internal UUIDs. Refer to customers by name and customer code, jobs by job number, technicians by name.',
    'Answer only what was asked. Do not list extra records the question did not ask about.',
    'Default to one or two direct sentences and at most 60 words. Only provide a list or longer explanation when the admin explicitly asks for details or a list.',
    'Live operations snapshots are formatted separately — never merge them into one paragraph.',
    'Keep answer concise and practical for Indian RO service ops.',
  ].join(' ');
}

function filterProposedActionsForPlan(actions, tools) {
  const mayDraft = Array.isArray(tools) && tools.includes('action_draft');
  const mayNavigate = Array.isArray(tools) && tools.includes('app_navigation');
  return (Array.isArray(actions) ? actions : [])
    .filter(
      (action) =>
        action?.type === 'open_customer' ||
        (action?.type === 'open_app' &&
          (mayNavigate ||
            (mayDraft && action.payload?.target === 'quick_upi_qr'))) ||
        (action?.type === 'open_document_draft' && mayDraft) ||
        (mayDraft && !['open_app', 'open_document_draft'].includes(action?.type))
    )
    .map((action) => ({ ...action, requiresConfirm: true }));
}

function filterProposedActionsForRequest(actions, message) {
  const lower = String(message || '').toLowerCase();
  return (Array.isArray(actions) ? actions : []).filter((action) => {
    if (action?.type === 'schedule_follow_up') {
      return /\bfollow[\s-]?up\b|\breschedule\b/.test(lower);
    }
    if (action?.type === 'create_reminder') {
      return /\bremind(?:er| me)?\b/.test(lower);
    }
    return true;
  });
}

function deriveNavigationActions(message) {
  const lower = String(message || '').toLowerCase();
  if (isQuickPaymentQrGenerationRequest(message, extractQueryHints(message))) {
    return [];
  }
  const rules = [
    [/whatsapp settings|whatsapp crm|disable whatsapp/, 'whatsapp_settings', 'WhatsApp settings'],
    [/analytics/, 'analytics', 'Analytics'],
    [/completed jobs/, 'completed_jobs', 'Completed jobs'],
    [/ongoing jobs|open jobs/, 'ongoing_jobs', 'Ongoing jobs'],
    [/follow[\s-]?up jobs/, 'followup_jobs', 'Follow-up jobs'],
    [
      /quick(?:\s+payment)?\s+(?:upi\s+)?qr|quick upi|generate.*(?:upi\s+)?qr/,
      'quick_upi_qr',
      'Quick payment QR',
    ],
    [/payment qr|common payment qr|upi qr settings/, 'payment_qr', 'Payment QR settings'],
    [/ai usage|change the ai model|ai model/, 'ai_usage', 'AI usage settings'],
    [/pdf compression|turn off pdf/, 'dashboard_settings', 'Dashboard settings'],
    [/notification settings|notification prefs/, 'settings', 'Settings'],
    [/technician locations|live location/, 'technician_locations', 'Technician locations'],
    [/whatsapp inbox/, 'whatsapp_inbox', 'WhatsApp inbox'],
    [/pending payments/, 'pending_payments', 'Pending payments'],
    [/billing/, 'billing', 'Billing'],
    [/payments?/, 'payments', 'Payments'],
    [/technicians?/, 'technicians', 'Technicians'],
    [/inventory/, 'inventory', 'Inventory'],
    [/settings/, 'settings', 'Settings'],
    [/dashboard/, 'dashboard', 'Dashboard'],
  ];
  for (const [pattern, target, label] of rules) {
    if (pattern.test(lower)) {
      return [
        {
          type: 'open_app',
          label: `Open ${label}`,
          confidence: 0.95,
          requiresConfirm: true,
          payload: { target },
        },
      ];
    }
  }
  return [];
}

function navigationAnswer(message, actions) {
  const label =
    String(actions?.[0]?.label || 'that screen')
      .replace(/^Open /i, '')
      .trim() || 'that screen';
  const lower = String(message || '').toLowerCase();
  if (/\bturn off\b|\bdisable\b/.test(lower)) {
    return `Opening ${label} so you can turn it off.`;
  }
  if (/\bchange\b|\bswitch\b|\bselect\b|\bconfigure\b|\bmanage\b/.test(lower)) {
    return `Opening ${label} so you can change it.`;
  }
  return `Opening ${label}.`;
}

function buildDeterministicActionAnswer(message, actions, entities = {}) {
  const action = actions?.[0];
  if (!action) return 'Ready — tap the action button to continue.';
  const customerName = entities.customers?.[0]?.name || 'customer';
  const jobNumber = entities.jobs?.[0]?.jobNumber || action.payload?.jobNumber || 'job';
  if (action.type === 'open_document_draft') {
    const labels = {
      quotation: 'Quotation',
      service_bill: 'Service bill',
      tax_invoice: 'Tax invoice',
      amc: 'AMC',
      warranty: 'Warranty',
    };
    const label = labels[action.payload?.documentType] || 'Document';
    return `${label} draft is ready for ${customerName} — tap the button to open the form.`;
  }
  if (action.type === 'open_job') {
    const mode = action.payload?.mode || 'details';
    if (mode === 'follow_up') {
      return `Follow-up for job ${jobNumber} is ready — tap the button to review it.`;
    }
    return `Job ${jobNumber} review is ready — tap the button to open it.`;
  }
  if (action.type === 'open_customer_composer') {
    const channel = action.payload?.channel === 'email' ? 'Email' : 'WhatsApp';
    return `${channel} composer is ready for ${customerName} — tap the button to open it.`;
  }
  if (action.type === 'send_payment_qr') {
    const amount = Number(action.payload?.amount);
    const phone = String(action.payload?.phone || '').trim();
    const amountText =
      Number.isFinite(amount) && amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : 'payment';
    return `Payment QR for ${amountText}${phone ? ` to ${phone}` : ''} is ready — tap Send on WhatsApp to deliver it.`;
  }
  if (action.type === 'schedule_follow_up') {
    return `Follow-up for job ${jobNumber} is ready — tap the button to schedule it.`;
  }
  if (action.type === 'create_job') {
    return `Job draft is ready for ${customerName} — tap the button to open the form.`;
  }
  if (action.type === 'create_customer' || action.type === 'create_customer_and_job') {
    const name = action.payload?.fullName || customerName;
    return action.type === 'create_customer_and_job'
      ? `Customer and job draft for ${name || 'the new customer'} is ready — tap the button to open the form.`
      : `Customer draft for ${name || 'the new customer'} is ready — tap the button to open the form.`;
  }
  if (action.type === 'open_app') {
    if (
      action.payload?.target === 'quick_upi_qr' &&
      (action.payload?.customerId || action.payload?.amount)
    ) {
      const amount = Number(action.payload?.amount);
      const amountText =
        Number.isFinite(amount) && amount > 0
          ? ` (₹${amount.toLocaleString('en-IN')})`
          : '';
      if (action.payload?.customerId) {
        return `Quick payment QR for ${customerName}${amountText} is ready — tap the button to open it.`;
      }
      return `Quick payment QR${amountText} is ready — tap the button to open it.`;
    }
    return navigationAnswer(message, actions);
  }
  return 'Ready — tap the action button to continue.';
}

function buildDeterministicCrmResponse({ plan, pack, message, config, servedProvider, servedModel, fellBack, started, usage, plannerStrategy }) {
  const entities = visibleEntitiesForTools(pack, plan.tools);

  if (plan.tools.includes('live_ops') && pack.stats?.liveOps) {
    const liveOps = pack.stats.liveOps;
    const answer = formatLiveOpsAnswer(liveOps);
    const liveOpsSnapshot = publicLiveOpsSnapshot(liveOps, pack.truncated);
    const warnings = liveOpsSnapshot?.truncated
      ? ['Open-job list was truncated; counts are from the loaded slice.']
      : [];
    return {
      answer,
      confidence: 0.95,
      requiresHuman: false,
      warnings,
      entities,
      proposedActions: [],
      metaExtra: { liveOpsSnapshot },
      promptHash: sha256(JSON.stringify({ message, route: 'live_ops', liveOpsSnapshot })),
    };
  }

  if (isQuickPaymentQrGenerationRequest(message, extractQueryHints(message))) {
    const derivedActions = filterActionsForEntityState(
      filterProposedActionsForPlan(
        deriveSafeUiActions({
          message,
          tools: ['action_draft', 'customer_search'],
          customers: pack.customers,
          jobs: pack.jobs,
        }),
        ['action_draft', 'customer_search']
      ),
      pack.jobs
    );
    if (derivedActions.length) {
      return {
        answer: buildDeterministicActionAnswer(message, derivedActions, {
          customers: pack.customers,
          jobs: pack.jobs,
        }),
        confidence: 0.95,
        requiresHuman: false,
        warnings: [],
        entities,
        proposedActions: derivedActions.map((action) => ({ ...action, requiresConfirm: true })),
        metaExtra: {},
        promptHash: sha256(JSON.stringify({ message, route: 'quick_payment_qr' })),
      };
    }
    if (!derivedActions.length) {
      const amount = extractQuickPaymentAmount(message);
      const hints = extractQueryHints(message);
      if (amount && isQuickPaymentQrSendRequest(message, hints) && hints.phone) {
        const sendAction = {
          type: 'send_payment_qr',
          label: `Send payment QR · ₹${amount.toLocaleString('en-IN')} to ${hints.phone}`,
          confidence: 0.95,
          requiresConfirm: true,
          payload: { phone: hints.phone, amount },
        };
        return {
          answer: buildDeterministicActionAnswer(message, [sendAction], {
            customers: pack.customers,
            jobs: pack.jobs,
          }),
          confidence: 0.95,
          requiresHuman: false,
          warnings: [],
          entities,
          proposedActions: [{ ...sendAction, requiresConfirm: true }],
          metaExtra: {},
          promptHash: sha256(JSON.stringify({ message, route: 'quick_payment_qr_send' })),
        };
      }
      if (amount) {
        const fallbackAction = {
          type: 'open_app',
          label: `Quick payment QR · ₹${amount.toLocaleString('en-IN')}`,
          confidence: 0.95,
          requiresConfirm: true,
          payload: {
            target: 'quick_upi_qr',
            amount,
            ...(hints.phone ? { phone: hints.phone } : {}),
          },
        };
        return {
          answer: buildDeterministicActionAnswer(message, [fallbackAction], {
            customers: pack.customers,
            jobs: pack.jobs,
          }),
          confidence: 0.95,
          requiresHuman: false,
          warnings: [],
          entities,
          proposedActions: [{ ...fallbackAction, requiresConfirm: true }],
          metaExtra: {},
          promptHash: sha256(JSON.stringify({ message, route: 'quick_payment_qr_amount_only' })),
        };
      }
      return {
        answer: pack.customers?.length
          ? 'Could not prepare that Quick payment QR request.'
          : 'Enter an amount for Quick payment QR, e.g. quick payment QR of 1000.',
        confidence: 0.9,
        requiresHuman: false,
        warnings: [],
        entities,
        proposedActions: [],
        metaExtra: {},
        promptHash: sha256(JSON.stringify({ message, route: 'quick_payment_qr_missing_customer' })),
      };
    }
  }

  const navActions = plan.tools.includes('app_navigation')
    ? filterProposedActionsForPlan(deriveNavigationActions(message), plan.tools)
    : [];
  if (plan.tools.includes('app_navigation') && navActions.length) {
    return {
      answer: navigationAnswer(message, navActions),
      confidence: 0.95,
      requiresHuman: false,
      warnings: [],
      entities,
      proposedActions: navActions.map((action) => ({ ...action, requiresConfirm: true })),
      metaExtra: {},
      promptHash: sha256(JSON.stringify({ message, route: 'app_navigation', target: navActions[0]?.payload?.target })),
    };
  }

  const derivedActions = filterActionsForEntityState(
    filterProposedActionsForPlan(
      deriveSafeUiActions({
        message,
        tools: plan.tools,
        customers: pack.customers,
        jobs: pack.jobs,
      }),
      plan.tools
    ),
    pack.jobs
  );
  if (plan.tools.includes('action_draft') && derivedActions.length) {
    return {
      answer: buildDeterministicActionAnswer(message, derivedActions, {
        customers: pack.customers,
        jobs: pack.jobs,
      }),
      confidence: 0.95,
      requiresHuman: false,
      warnings: [],
      entities,
      proposedActions: derivedActions.map((action) => ({ ...action, requiresConfirm: true })),
      metaExtra: {},
      promptHash: sha256(JSON.stringify({ message, route: 'action_draft', actions: derivedActions.map((a) => a.type) })),
    };
  }

  if (plan.tools.includes('action_draft') && plan.tools.includes('job_search') && pack.jobs?.[0]) {
    const job = pack.jobs[0];
    const lower = String(message || '').toLowerCase();
    if (
      String(job.status || '').toUpperCase() === 'COMPLETED' &&
      /\b(?:edit|assign|reassign|complete|finish|close)\b/.test(lower)
    ) {
      const detailsAction = {
        type: 'open_job',
        label: `Open job ${job.jobNumber || ''}`.trim(),
        confidence: 0.95,
        requiresConfirm: true,
        payload: { jobId: String(job.id), mode: 'details' },
      };
      return {
        answer: `Job ${job.jobNumber} is already completed. You can still open its details.`,
        confidence: 0.95,
        requiresHuman: false,
        warnings: [],
        entities,
        proposedActions: [detailsAction],
        metaExtra: {},
        promptHash: sha256(JSON.stringify({ message, route: 'completed_job', jobId: job.id })),
      };
    }
  }

  if (!plan.tools.includes('action_draft')) {
    const statsAnswer = formatStatsAnswerForTools(pack, plan.tools);
    if (statsAnswer) {
      return {
        answer: statsAnswer,
        confidence: 0.92,
        requiresHuman: false,
        warnings: [],
        entities,
        proposedActions: [],
        metaExtra: {},
        promptHash: sha256(JSON.stringify({ message, route: 'stats', tools: plan.tools })),
      };
    }
  }

  return null;
}

function deriveSafeUiActions({ message, tools, customers, jobs }) {
  const lower = String(message || '').toLowerCase();
  const rows = Array.isArray(customers) ? customers : [];
  const jobRows = Array.isArray(jobs) ? jobs : [];
  const actions = [];

  if (
    Array.isArray(tools) &&
    tools.includes('action_draft') &&
    /\bcreate\s+(?:a\s+)?customers?\b/.test(lower)
  ) {
    const hints = extractQueryHints(message);
    const nameMatch = String(message || '').match(
      /\bcustomers?\s+([A-Za-z][A-Za-z\s.'-]{1,60}?)(?:\s+phone\b|\s+and\b|\s+with\b|$)/i
    );
    const fullName = (nameMatch?.[1] || hints.nameTokens.join(' ') || '').trim();
    const phone = hints.phone || '';
    const withJob = /\b(?:service )?job\b/.test(lower);
    if (withJob) {
      actions.push({
        type: 'create_customer_and_job',
        label: `Create customer${fullName ? ` ${fullName}` : ''} and job`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          fullName,
          phone,
          instruction: String(message || '').slice(0, 500),
          serviceSubType: /\binstall/.test(lower) ? 'New Purifier Installation' : 'Service',
        },
      });
      return actions;
    }
    if (fullName || phone) {
      actions.push({
        type: 'create_customer',
        label: `Create customer${fullName ? ` ${fullName}` : ''}`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          fullName,
          phone,
          instruction: String(message || '').slice(0, 500),
        },
      });
      return actions;
    }
  }

  if (
    Array.isArray(tools) &&
    tools.includes('action_draft') &&
    rows[0]?.id &&
    (/\bcreate\b/.test(lower) || /\bbook(?:ing)?\s+(?:a\s+)?(?:service\s+)?(?:visit|appointment)\b/.test(lower)) &&
    /\b(?:service )?job\b|\bvisit\b|\bappointment\b/.test(lower)
  ) {
    actions.push({
      type: 'create_job',
      label: `Create job for ${rows[0].name || 'customer'}`,
      confidence: 0.95,
      requiresConfirm: true,
      payload: {
        customerId: String(rows[0].id),
        serviceSubType: /\binstall/.test(lower) ? 'New Purifier Installation' : 'Service',
        instruction: String(message || '').slice(0, 500),
      },
    });
  }

  if (
    Array.isArray(tools) &&
    tools.includes('action_draft') &&
    /\b(?:draft|prepare|open|make|create|generate)\b/.test(lower) &&
    rows[0]?.id
  ) {
    const documentType = /\bquotation\b|\bquote\b/.test(lower)
      ? 'quotation'
      : /\btax invoice\b|\bgst invoice\b/.test(lower)
        ? 'tax_invoice'
        : /\bservice bill\b|\bbill\b/.test(lower)
          ? 'service_bill'
          : /\bamc\b/.test(lower)
            ? 'amc'
            : /\bwarranty\b/.test(lower)
              ? 'warranty'
              : null;
    if (documentType) {
      const documentLabel = {
        quotation: 'quotation',
        service_bill: 'service bill',
        tax_invoice: 'tax invoice',
        amc: 'AMC',
        warranty: 'warranty',
      }[documentType];
      actions.push({
        type: 'open_document_draft',
        label: `Open ${documentLabel} for ${rows[0].name || 'customer'}`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          documentType,
          customerId: String(rows[0].id),
          instruction: String(message || '').slice(0, 500),
        },
      });
    }
  }

  if (Array.isArray(tools) && tools.includes('action_draft') && jobRows[0]?.id) {
    const mode = /\breassign\b/.test(lower)
      ? 'reassign'
      : /\bassign\b/.test(lower)
        ? 'assign'
        : /\bcomplete\b|\bclose\b|\bfinish\b/.test(lower)
          ? 'complete'
          : /\bfollow[\s-]?up\b|\breschedule\b/.test(lower)
            ? 'follow_up'
            : /\bedit\b|\bchange\b|\bupdate\b/.test(lower)
              ? 'edit'
              : /\bopen\b|\bview\b|\bshow\b|\bdetails?\b/.test(lower)
                ? 'details'
                : null;
    if (mode) {
      if (mode === 'follow_up' && /\bschedule\b|\bfollow[\s-]?up\b/.test(lower)) {
        actions.push({
          type: 'schedule_follow_up',
          label: `Schedule follow-up for job ${jobRows[0].jobNumber || ''}`.trim(),
          confidence: 0.95,
          requiresConfirm: true,
          payload: {
            jobId: String(jobRows[0].id),
            followUpReason: String(message || '').slice(0, 500),
          },
        });
      } else {
        actions.push({
          type: 'open_job',
          label: `${mode === 'details' ? 'Open' : 'Review'} job ${jobRows[0].jobNumber || ''}`.trim(),
          confidence: 0.95,
          requiresConfirm: true,
          payload: { jobId: String(jobRows[0].id), mode },
        });
      }
    }
  }

  if (
    Array.isArray(tools) &&
    tools.includes('action_draft') &&
    isQuickPaymentQrGenerationRequest(message, extractQueryHints(message))
  ) {
    const hints = extractQueryHints(message);
    const amount = extractQuickPaymentAmount(message);
    const sendIntent = isQuickPaymentQrSendRequest(message, hints);
    const destPhone =
      hints.phone ||
      (rows[0]?.phone ? String(rows[0].phone).replace(/\D/g, '').slice(-10) : null);

    if (sendIntent && amount && destPhone && destPhone.length >= 10) {
      actions.push({
        type: 'send_payment_qr',
        label: `Send payment QR · ₹${amount.toLocaleString('en-IN')} to ${destPhone}`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          phone: destPhone,
          amount,
          ...(rows[0]?.id
            ? { customerId: String(rows[0].id), customerName: rows[0].name || undefined }
            : {}),
        },
      });
      return actions;
    }

    if (rows[0]?.id) {
      actions.push({
        type: 'open_app',
        label: `Quick payment QR${amount ? ` · ₹${amount.toLocaleString('en-IN')}` : ''} for ${
          rows[0].name || 'customer'
        }`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          target: 'quick_upi_qr',
          customerId: String(rows[0].id),
          ...(amount ? { amount } : {}),
          ...(destPhone && destPhone.length >= 10 ? { phone: destPhone } : {}),
        },
      });
    } else if (amount) {
      actions.push({
        type: 'open_app',
        label: `Quick payment QR · ₹${amount.toLocaleString('en-IN')}`,
        confidence: 0.95,
        requiresConfirm: true,
        payload: {
          target: 'quick_upi_qr',
          amount,
          ...(destPhone && destPhone.length >= 10 ? { phone: destPhone } : {}),
        },
      });
    }
  }

  if (
    Array.isArray(tools) &&
    tools.includes('action_draft') &&
    rows[0]?.id &&
    /\b(?:whatsapp|email|compose|write|message)\b/.test(lower)
  ) {
    const channel = /\bemail\b/.test(lower) ? 'email' : 'whatsapp';
    const template = /\bpending payment\b|\bpayment due\b/.test(lower)
      ? 'pending_payment'
      : /\bservice reminder\b|\bservice due\b/.test(lower)
        ? 'service_reminder'
        : /\bquotation\b|\bquote\b/.test(lower)
          ? 'quotation'
          : /\binvoice\b/.test(lower)
            ? 'invoice'
            : 'general';
    actions.push({
      type: 'open_customer_composer',
      label: `Open ${channel === 'email' ? 'email' : 'WhatsApp'} composer for ${
        rows[0].name || 'customer'
      }`,
      confidence: 0.95,
      requiresConfirm: true,
      payload: { customerId: String(rows[0].id), channel, template },
    });
  }

  return actions;
}

function mergeSafeUiActions(modelActions, derivedActions) {
  let out = Array.isArray(modelActions) ? [...modelActions] : [];
  for (const action of Array.isArray(derivedActions) ? derivedActions : []) {
    if (['open_job', 'open_customer_composer', 'open_document_draft'].includes(action?.type)) {
      out = out.filter((existing) => {
        if (existing?.type !== action.type) return true;
        if (action.payload?.jobId) return existing.payload?.jobId !== action.payload.jobId;
        if (action.payload?.customerId) {
          return existing.payload?.customerId !== action.payload.customerId;
        }
        return false;
      });
    }
    if (
      action?.type === 'open_job' &&
      action?.payload?.mode === 'follow_up' &&
      out.some(
        (existing) =>
          existing?.type === 'schedule_follow_up' &&
          existing?.payload?.jobId === action.payload?.jobId
      )
    ) {
      continue;
    }
    const duplicate = out.some(
      (existing) =>
        existing?.type === action.type &&
        existing?.payload?.customerId === action.payload?.customerId &&
        existing?.payload?.documentType === action.payload?.documentType &&
        existing?.payload?.jobId === action.payload?.jobId &&
        existing?.payload?.mode === action.payload?.mode &&
        existing?.payload?.channel === action.payload?.channel
    );
    if (!duplicate) out.push(action);
  }
  return out.slice(0, 4);
}

function filterActionsForEntityState(actions, jobs) {
  const jobById = new Map(
    (Array.isArray(jobs) ? jobs : []).map((job) => [String(job.id), String(job.status || '')])
  );
  return (Array.isArray(actions) ? actions : []).filter((action) => {
    if (action?.type !== 'open_job') return true;
    const status = jobById.get(String(action.payload?.jobId || ''));
    if (status !== 'COMPLETED') return true;
    return !['edit', 'assign', 'reassign', 'complete'].includes(action.payload?.mode);
  });
}

function normalizePendingActionAnswer(answer, actions) {
  const text = String(answer || '');
  if (!(Array.isArray(actions) && actions.length)) return text;
  return text
    .replace(/\bI have navigated to\b/gi, 'I can open')
    .replace(/\bI navigated to\b/gi, 'I can open')
    .replace(/\bI have opened\b/gi, 'I can open')
    .replace(/\bI opened\b/gi, 'I can open')
    .replace(/\bI have prepared the (dashboard|WhatsApp|AI) settings\b/gi, 'I can open the $1 settings');
}

function buildUserPrompt(message, contextText, history = []) {
  const recent = (Array.isArray(history) ? history : []).slice(-8);
  return [
    ...(recent.length
      ? [
          'Recent conversation:',
          ...recent.map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'Admin'}: ${String(turn.text || '')}`),
          '',
        ]
      : []),
    'Admin request:',
    '<message>',
    String(message || ''),
    '</message>',
    '',
    contextText,
    '',
    'Respond with JSON only.',
  ].join('\n');
}

function addUsage(total, next) {
  const a = total || {};
  const b = next || {};
  return {
    inputTokens: (Number(a.inputTokens) || 0) + (Number(b.inputTokens) || 0),
    outputTokens: (Number(a.outputTokens) || 0) + (Number(b.outputTokens) || 0),
    totalTokens: (Number(a.totalTokens) || 0) + (Number(b.totalTokens) || 0),
  };
}

function emptyEntities() {
  return {
    customers: [],
    jobs: [],
    reminders: [],
    payments: [],
    documents: [],
    technicians: [],
  };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const headers = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (
    shouldRejectMissingOrigin(event.headers || {}, {
      allowMissingWithBearer: true,
    })
  ) {
    return json(403, headers, { success: false, error: 'Forbidden' });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, headers, { success: false, error: 'Method not allowed' });
  }

  const rawBody = event.body || '';
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json(413, headers, { success: false, error: 'Request too large' });
  }

  const token = readBearerToken(event);
  const auth = await verifyFullAdminBearerToken(token);
  if (!auth.ok) {
    return json(auth.error === 'Forbidden' ? 403 : 401, headers, {
      success: false,
      error: auth.error || 'Unauthorized',
    });
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json(400, headers, { success: false, error: 'Invalid JSON' });
  }

  // Ignore client provider/model/system/tools/sql/messages.
  if (body.provider || body.model || body.systemInstruction || body.tools || body.messages || body.sql) {
    /* strip silently */
  }

  const parsed = parseCrmChatRequest(body);
  if (!parsed.ok) {
    return json(400, headers, { success: false, error: parsed.error });
  }

  const ipBurst = checkRateLimit(event, {
    maxRequests: 24,
    windowMs: 60_000,
    endpoint: 'ai-crm-chat-ip',
  });
  const userBurst = checkRateLimitForKey(auth.userId || 'unknown', {
    maxRequests: 16,
    windowMs: 60_000,
    endpoint: 'ai-crm-chat-user',
  });
  if (!ipBurst.allowed || !userBurst.allowed) {
    return json(429, headers, {
      success: false,
      error: 'Too many AI requests. Try again shortly.',
    });
  }

  // Exact greetings/thanks never need a provider call. Keeping this after
  // full-admin auth + rate limiting prevents the endpoint becoming a public
  // chatbot while making conversational turns effectively instant.
  const deterministicPlan = inferDeterministicPlan(parsed.value.message, parsed.value.history);
  if (deterministicPlan?.route === 'conversation') {
    return json(200, headers, {
      success: true,
      answer: deterministicPlan.directAnswer,
      confidence: 1,
      requiresHuman: false,
      warnings: [],
      entities: emptyEntities(),
      proposedActions: [],
      meta: {
        latencyMs: 0,
        plannerRoute: 'conversation',
        plannerTools: [],
        plannerStrategy: 'local',
        canAutoSend: false,
        canDelete: false,
        canCreateJob: false,
        canMutate: false,
      },
    });
  }

  const config = await getAiAssistantConfig();
  if (!config) {
    return json(503, headers, {
      success: false,
      error: 'AI assistant is not configured',
    });
  }

  // Fully deterministic CRM answers (Quick QR, navigation, stats, …) skip quota —
  // no LLM call, so they should not consume the daily request/token budget.
  let plan = coerceCustomerPaymentQrPlan(parsed.value.message, deterministicPlan);
  let cachedPack = null;
  let plannerStrategy = plan ? 'deterministic' : 'model';
  if (plan && plan.route !== 'conversation') {
    if (isQuickPaymentQrGenerationRequest(parsed.value.message, extractQueryHints(parsed.value.message))) {
      plannerStrategy = 'deterministic';
    }
    const startedEarly = Date.now();
    cachedPack = await lookupCrmContext({
      message: buildAllowlistedLookupQuery(plan, parsed.value.message),
      focusCustomerId: parsed.value.focusCustomerId,
      plannerTools: plan.tools,
    });
    // Universal SQL query: generate SQL via AI then execute it read-only
    if (plan.tools.includes('sql_query') && cachedPack.stats?.sqlQueryAvailable && !cachedPack.stats.sqlQueryResult) {
      try {
        const sqlGen = await generateWithProvider(config, {
          operation: 'crm_chat',
          rawText: true,
          systemInstruction: [
            'You are a PostgreSQL expert. The user asked a CRM analytics question.',
            'Write ONE safe read-only SELECT query to answer it. Return ONLY raw SQL — no markdown, no explanation.',
            'Rules: SELECT only. Never SELECT *. LIMIT 20. Use (col AT TIME ZONE \'Asia/Kolkata\') for IST times.',
            'Do not filter to today unless the user said today.',
            'For busiest day/hour return the full ranking (all 7 days or hours with jobs), not a single row.',
            'For day-of-week include TO_CHAR(..., \'FMDay\') AS day_name and COUNT(*) AS job_count.',
            'For hours include EXTRACT(HOUR ...) AS hour_ist and COUNT(*) AS job_count.',
            'For shortest/longest job duration: COMPLETED jobs only, start_time present, duration_minutes = EXTRACT(EPOCH FROM (COALESCE(end_time, completed_at) - start_time))/60, duration_minutes BETWEEN 1 AND 1440. Return job_number, duration_minutes, scheduled_date only.',
            'Schema:\n' + AI_READONLY_SCHEMA,
          ].join('\n'),
          messages: [{ role: 'user', text: parsed.value.message }],
          temperature: 0,
          maxOutputTokens: 400,
        });
        const generatedSql = (sqlGen.text || '').trim().replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
        if (generatedSql.toLowerCase().startsWith('select')) {
          const { getServiceSupabase } = require('./whatsapp-helper');
          const db = getServiceSupabase();
          const result = await runReadonlyQuery(db, generatedSql);
          cachedPack.stats.sqlQueryResult = {
            rows: result.rows,
            query: generatedSql,
            label: 'Analytics result',
            error: result.error,
          };
        }
      } catch (sqlErr) {
        console.warn('[ai-crm-chat] sql_query generation/exec failed:', sqlErr.message);
        cachedPack.stats.sqlQueryResult = { rows: [], error: sqlErr.message, label: 'Analytics' };
      }
    }

    const deterministicEarly = buildDeterministicCrmResponse({
      plan,
      pack: cachedPack,
      message: parsed.value.message,
      config,
      servedProvider: config.provider,
      servedModel: config.model,
      fellBack: false,
      started: startedEarly,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      plannerStrategy,
    });
    if (deterministicEarly) {
      return json(200, headers, {
        success: true,
        answer: deterministicEarly.answer,
        confidence: deterministicEarly.confidence,
        requiresHuman: deterministicEarly.requiresHuman,
        warnings: deterministicEarly.warnings,
        entities: deterministicEarly.entities,
        proposedActions: deterministicEarly.proposedActions,
        meta: {
          ...publicConfigSummary(config),
          provider: config.provider,
          model: config.model,
          fellBack: false,
          latencyMs: Date.now() - startedEarly,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          plannerRoute: 'crm',
          plannerTools: plan.tools,
          plannerStrategy,
          quotaSkipped: true,
          ...deterministicEarly.metaExtra,
          canAutoSend: false,
          canDelete: false,
          canCreateJob: false,
          canMutate: false,
        },
      });
    }
  }

  const dayKey = localDayKey();
  const idempotencyKey = sha256(`${auth.userId}|crm_chat|${parsed.value.message}|${dayKey}|${Date.now()}`).slice(0, 40);

  const quota = await claimAiQuota({
    actorUserId: auth.userId,
    dayKey,
    requestLimit: config.dailyRequestLimit,
    tokenLimit: config.dailyTokenLimit,
    // Deterministic routes skip the planner provider call.
    reserveTokens: plan ? 1800 : 3200,
    idempotencyKey,
    provider: config.provider,
    model: config.model,
    operation: 'crm_chat',
  });
  if (!quota.ok) {
    return json(quota.quotaExceeded ? 429 : 503, headers, {
      success: false,
      error: quota.error || 'AI quota unavailable',
    });
  }

  const started = Date.now();
  let finalizeStatus = 'error';
  let errorCategory = null;
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let promptHash = null;
  let responseHash = null;
  let servedProvider = config.provider;
  let servedModel = config.model;
  let fellBack = false;

  try {
    assertNoMutationTools([]);

    if (!plan) {
      const plannerResult = await generateWithProvider(config, {
        operation: 'crm_chat_plan',
        systemInstruction: plannerSystemInstruction(),
        messages: buildPlannerMessages(parsed.value.history, parsed.value.message),
        temperature: 0,
        maxOutputTokens: 500,
        timeoutMs: 12_000,
        responseJsonSchema: CRM_PLANNER_SCHEMA,
      });
      usage = addUsage(usage, plannerResult.usage);
      servedProvider = plannerResult.rawMetadata?.provider || config.provider;
      servedModel = plannerResult.rawMetadata?.model || config.model;
      fellBack = plannerResult.rawMetadata?.fellBack === true;
      plan = augmentPlanTools(
        normalizePlannerOutput(
          plannerResult.parsed ||
            (() => {
              try {
                return JSON.parse(plannerResult.text || '{}');
              } catch {
                return {};
              }
            })(),
          parsed.value.message
        ),
        parsed.value.message
      );
    }
    if (!plan || (plan.route === 'crm' && !(plan.tools || []).length)) {
      plan = inferUniversalCrmPlan(parsed.value.message);
      plannerStrategy = 'deterministic';
    }
    plan = coerceCustomerPaymentQrPlan(parsed.value.message, plan);
    if (isQuickPaymentQrGenerationRequest(parsed.value.message, extractQueryHints(parsed.value.message))) {
      plannerStrategy = 'deterministic';
    }

    if (plan.route === 'conversation') {
      const answer = plan.directAnswer;
      promptHash = sha256(
        JSON.stringify({
          message: parsed.value.message,
          history: parsed.value.history,
          route: 'conversation',
        })
      );
      responseHash = sha256(answer);
      finalizeStatus = 'ok';
      return json(200, headers, {
        success: true,
        answer,
        confidence: 0.9,
        requiresHuman: false,
        warnings: [],
        entities: emptyEntities(),
        proposedActions: [],
        meta: {
          ...publicConfigSummary(config),
          provider: servedProvider,
          model: servedModel,
          fellBack,
          latencyMs: Date.now() - started,
          usage,
          plannerRoute: 'conversation',
          plannerTools: [],
          plannerStrategy,
          canAutoSend: false,
          canDelete: false,
          canCreateJob: false,
          canMutate: false,
        },
      });
    }

    const pack =
      cachedPack ||
      (await lookupCrmContext({
        message: buildAllowlistedLookupQuery(plan, parsed.value.message),
        focusCustomerId: parsed.value.focusCustomerId,
        plannerTools: plan.tools,
      }));

    const deterministic = buildDeterministicCrmResponse({
      plan,
      pack,
      message: parsed.value.message,
      config,
      servedProvider,
      servedModel,
      fellBack,
      started,
      usage,
      plannerStrategy,
    });
    if (deterministic) {
      promptHash = deterministic.promptHash;
      responseHash = sha256(deterministic.answer);
      finalizeStatus = 'ok';
      return json(200, headers, {
        success: true,
        answer: deterministic.answer,
        confidence: deterministic.confidence,
        requiresHuman: deterministic.requiresHuman,
        warnings: deterministic.warnings,
        entities: deterministic.entities,
        proposedActions: deterministic.proposedActions,
        meta: {
          ...publicConfigSummary(config),
          provider: servedProvider,
          model: servedModel,
          fellBack,
          latencyMs: Date.now() - started,
          usage,
          plannerRoute: 'crm',
          plannerTools: plan.tools,
          plannerStrategy,
          ...deterministic.metaExtra,
          canAutoSend: false,
          canDelete: false,
          canCreateJob: false,
          canMutate: false,
        },
      });
    }

    const contextText = formatContextForPrompt(pack);
    const userPrompt = buildUserPrompt(parsed.value.message, contextText, parsed.value.history);
    promptHash = sha256(userPrompt);

    const providerResult = await generateWithProvider(config, {
      operation: 'crm_chat',
      systemInstruction: buildSystemInstruction(),
      messages: [{ role: 'user', text: userPrompt }],
      temperature: 0.2,
      // Read-only answers should be short; action drafts need room for their
      // validated payload schema.
      // Enough headroom that a long list answer still closes its JSON object.
      maxOutputTokens: plan.tools.includes('action_draft') ? 1600 : 1200,
      timeoutMs: 20_000,
      responseJsonSchema: CRM_CHAT_SCHEMA,
    });

    servedProvider = providerResult.rawMetadata?.provider || config.provider;
    servedModel = providerResult.rawMetadata?.model || config.model;
    usage = addUsage(usage, providerResult.usage);
    fellBack = fellBack || providerResult.rawMetadata?.fellBack === true;
    const rawObject =
      providerResult.parsed ||
      (() => {
        try {
          return JSON.parse(providerResult.text || '{}');
        } catch {
          return { answer: String(providerResult.text || '').trim() };
        }
      })();

    const normalized = normalizeCrmChatOutput(rawObject, {
      entities: {
        customers: pack.customers,
        jobs: pack.jobs,
      },
    });
    if (!normalized.ok) {
      errorCategory = 'empty_output';
      return json(502, headers, {
        success: false,
        error: 'AI returned an empty answer',
      });
    }

    // Hard guarantee: every action still requires human confirmation.
    const proposedActions = filterActionsForEntityState(
      mergeSafeUiActions(
        filterProposedActionsForRequest(
          filterProposedActionsForPlan(normalized.value.proposedActions, plan.tools),
          parsed.value.message
        ),
        deriveSafeUiActions({
          message: parsed.value.message,
          tools: plan.tools,
          customers: pack.customers,
          jobs: pack.jobs,
        })
      ),
      pack.jobs
    );
    const answer = normalizePendingActionAnswer(normalized.value.answer, proposedActions);

    responseHash = sha256(
      JSON.stringify({
        answer,
        actions: proposedActions,
        customerIds: pack.customers.map((c) => c.id),
      })
    );
    finalizeStatus = 'ok';

    return json(200, headers, {
      success: true,
      answer,
      confidence: normalized.value.confidence,
      requiresHuman: normalized.value.requiresHuman,
      warnings: normalized.value.warnings,
      entities: visibleEntitiesForTools(pack, plan.tools),
      proposedActions,
      meta: {
        ...publicConfigSummary(config),
        provider: servedProvider,
        model: servedModel,
        fellBack,
        latencyMs: Date.now() - started,
        usage,
        plannerRoute: 'crm',
        plannerTools: plan.tools,
        plannerStrategy,
        canAutoSend: false,
        canDelete: false,
        canCreateJob: false,
        canMutate: false,
      },
    });
  } catch (err) {
    const rateLimit = describeProviderRateLimit(err);
    errorCategory = rateLimit ? 'rate_limited' : 'provider_error';
    console.warn('[ai-crm-chat] failed', err?.message || err);
    if (rateLimit) {
      return json(429, headers, { success: false, error: rateLimit.message });
    }
    return json(502, headers, {
      success: false,
      error: 'Could not complete CRM AI request. Please try again.',
    });
  } finally {
    await finalizeAiInvocation({
      invocationId: quota.invocationId,
      actorUserId: auth.userId,
      dayKey,
      status: finalizeStatus,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Date.now() - started,
      promptHash,
      responseHash,
      errorCategory,
      reservedTokens: quota.reservedTokens || 0,
      provider: servedProvider,
      model: servedModel,
      fellBack,
    });
  }
};

module.exports._test = {
  buildSystemInstruction,
  buildUserPrompt,
  filterProposedActionsForPlan,
  filterProposedActionsForRequest,
  deriveSafeUiActions,
  deriveNavigationActions,
  buildDeterministicCrmResponse,
  buildDeterministicActionAnswer,
  mergeSafeUiActions,
  filterActionsForEntityState,
  normalizePendingActionAnswer,
  CRM_CHAT_SCHEMA,
};
