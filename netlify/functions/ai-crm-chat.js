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
const { generateWithProvider } = require('./ai-provider');
const { parseCrmChatRequest, normalizeCrmChatOutput, assertNoMutationTools } = require('./ai-crm-schemas');
const { lookupCrmContext, formatContextForPrompt } = require('./ai-crm-lookup');
const {
  CRM_PLANNER_SCHEMA,
  plannerSystemInstruction,
  normalizePlannerOutput,
  buildPlannerMessages,
  buildAllowlistedLookupQuery,
  visibleEntitiesForTools,
  augmentPlanTools,
  inferDeterministicPlan,
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
    'Conversation history explains references such as "those" or "last month", but it is not current CRM evidence. For the current answer, never reuse a count, amount, row, or date from an earlier assistant reply unless the current CRM lookup facts provide it again.',
    'The facts include today\'s IST date, exact counts, and capped lists. Use the exact counts for "how many" and totals; never count the rows in a list yourself, because lists are truncated.',
    'Job value figures are billed amounts for completed jobs, not confirmed cash collection — word it that way.',
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
    'proposedActions types are limited to: open_customer, create_customer, create_customer_and_job, edit_customer, create_job, schedule_follow_up, create_reminder, open_app, open_document_draft.',
    'Every proposed action MUST set requiresConfirm=true. Drafts only open normal CRM forms for admin review.',
    'Propose create, edit, job, follow-up, or reminder actions only when the user explicitly asks to perform or draft that action. A lookup such as "AMC expiring soon" must not invent reminder drafts.',
    'Use open_app when the admin asks to open, go to, show, manage, configure, or edit an app screen/settings area. payload.target MUST be one of: dashboard, ongoing_jobs, completed_jobs, followup_jobs, payments, billing, analytics, inventory, gst_invoices, amc_contracts, letterhead_documents, settings, whatsapp_inbox, whatsapp_settings, calling, reminders, pending_payments, recurring_service, advanced_search, warranty, privacy_center, pdf_authenticity, ai_usage, database_storage, direct_sale, lead_catalog, job_reviews, technicians, technician_locations, todo_tasks, payment_qr, quick_upi_qr, product_qr, data_export, app_lock, recent_accounts, quick_customer, amount_trackers, sent_email_log, measure_distance, arrange_visit_order, nearby_jobs, technician_live_location, message_technician. Never invent a URL or target.',
    'Use open_document_draft when the admin asks to draft/open/prepare a quotation, service bill, tax invoice, AMC, or warranty for a looked-up customer. payload must contain documentType (quotation|service_bill|tax_invoice|amc|warranty), the looked-up customerId, and instruction copied from the user request. This opens the normal document form and carries the instruction into its AI editor; it never generates, sends, downloads, or saves automatically.',
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
        (action?.type === 'open_app' && mayNavigate) ||
        (action?.type === 'open_document_draft' && mayDraft) ||
        (mayDraft && !['open_app', 'open_document_draft'].includes(action?.type))
    )
    .map((action) => ({ ...action, requiresConfirm: true }));
}

function deriveSafeUiActions({ message, tools, customers }) {
  const lower = String(message || '').toLowerCase();
  const rows = Array.isArray(customers) ? customers : [];
  const actions = [];

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

  return actions;
}

function mergeSafeUiActions(modelActions, derivedActions) {
  const out = Array.isArray(modelActions) ? [...modelActions] : [];
  for (const action of Array.isArray(derivedActions) ? derivedActions : []) {
    const duplicate = out.some(
      (existing) =>
        existing?.type === action.type &&
        existing?.payload?.customerId === action.payload?.customerId &&
        existing?.payload?.documentType === action.payload?.documentType
    );
    if (!duplicate) out.push(action);
  }
  return out.slice(0, 4);
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

  const dayKey = localDayKey();
  const idempotencyKey = sha256(`${auth.userId}|crm_chat|${parsed.value.message}|${dayKey}|${Date.now()}`).slice(0, 40);

  const quota = await claimAiQuota({
    actorUserId: auth.userId,
    dayKey,
    requestLimit: config.dailyRequestLimit,
    tokenLimit: config.dailyTokenLimit,
    // Deterministic routes skip the planner provider call.
    reserveTokens: deterministicPlan ? 1800 : 3200,
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

    let plan = deterministicPlan;
    let plannerStrategy = deterministicPlan ? 'deterministic' : 'model';
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

    const pack = await lookupCrmContext({
      message: buildAllowlistedLookupQuery(plan, parsed.value.message),
      focusCustomerId: parsed.value.focusCustomerId,
      plannerTools: plan.tools,
    });

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
    const proposedActions = mergeSafeUiActions(
      filterProposedActionsForPlan(normalized.value.proposedActions, plan.tools),
      deriveSafeUiActions({
        message: parsed.value.message,
        tools: plan.tools,
        customers: pack.customers,
      })
    );

    responseHash = sha256(
      JSON.stringify({
        answer: normalized.value.answer,
        actions: proposedActions,
        customerIds: pack.customers.map((c) => c.id),
      })
    );
    finalizeStatus = 'ok';

    return json(200, headers, {
      success: true,
      answer: normalized.value.answer,
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
    errorCategory = 'provider_error';
    console.warn('[ai-crm-chat] failed', err?.message || err);
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
  deriveSafeUiActions,
  mergeSafeUiActions,
  CRM_CHAT_SCHEMA,
};
