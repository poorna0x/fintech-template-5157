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
const {
  parseCrmChatRequest,
  normalizeCrmChatOutput,
  assertNoMutationTools,
} = require('./ai-crm-schemas');
const { lookupCrmContext, formatContextForPrompt } = require('./ai-crm-lookup');
const {
  CRM_PLANNER_SCHEMA,
  plannerSystemInstruction,
  normalizePlannerOutput,
  buildPlannerMessages,
  buildAllowlistedLookupQuery,
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
    'The facts include today\'s IST date, exact counts, and capped lists. Use the exact counts for "how many" and totals; never count the rows in a list yourself, because lists are truncated.',
    'Job value figures are billed amounts for completed jobs, not confirmed cash collection — word it that way.',
    'For customer value rankings, preserve the authoritative rank order. "confirmedFullyPaidINR" counts only completed jobs marked PAID; "completedJobBilledINR" can include unpaid or partially paid work. State both when useful and never call billed value collected cash.',
    'For technician billing rankings, preserve the authoritative rank order and call the amount completed-job billing, not cash collected or technician salary. Answer the requested period only.',
    'Never add up amounts yourself: only quote money totals that appear in the exact counts section, or the individual amounts shown on a row.',
    'When the facts contain jobs, reminders, payments or counts, summarise them directly instead of saying nothing was found.',
    'Only say no records were found when the relevant fact sections are empty or zero.',
    'Return ONLY JSON with keys: answer, confidence (0-1), requiresHuman (boolean), warnings (string[]), proposedActions (array).',
    'proposedActions types are limited to: open_customer, create_customer, create_customer_and_job, edit_customer, create_job, schedule_follow_up, create_reminder.',
    'Every proposed action MUST set requiresConfirm=true. Drafts only open normal CRM forms for admin review.',
    'Use create_customer when the admin asks to add a new customer. Copy only supplied name, phone, email, address, visible location label, Google Maps link, RO/softener type, brand, model and notes. Never invent missing values.',
    'Use create_customer_and_job when the admin explicitly asks for both a new customer and a job. Include the customer fields plus the job fields.',
    'A new-customer draft may omit phone, but warn that the CRM form requires it before saving.',
    'Use edit_customer only for a looked-up customerId. Put only explicitly requested changed fields inside payload.patch. Never clear unspecified fields.',
    'For create_job / create_reminder, payload.customerId must match a looked-up customer.',
    'create_job dates use YYYY-MM-DD. scheduledTimeSlot must be MORNING, AFTERNOON, EVENING, FLEXIBLE or CUSTOM; for an exact time use CUSTOM plus scheduledTimeCustom in 24h HH:MM.',
    'For schedule_follow_up, payload.jobId must match a looked-up job.',
    'If an existing customer/job is ambiguous, ask a clarifying question. New-customer actions do not need an existing customerId.',
    'Never claim you created, updated, deleted, emailed, or WhatsApped anything. Drafts only.',
    'Keep answer concise and practical for Indian RO service ops.',
  ].join(' ');
}

function buildUserPrompt(message, contextText, history = []) {
  const recent = (Array.isArray(history) ? history : []).slice(-8);
  return [
    ...(recent.length
      ? [
          'Recent conversation:',
          ...recent.map(
            (turn) =>
              `${turn.role === 'assistant' ? 'Assistant' : 'Admin'}: ${String(turn.text || '')}`
          ),
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

  if (shouldRejectMissingOrigin(event.headers || {}, { allowMissingWithBearer: true })) {
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
  if (
    body.provider ||
    body.model ||
    body.systemInstruction ||
    body.tools ||
    body.messages ||
    body.sql
  ) {
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
    return json(429, headers, { success: false, error: 'Too many AI requests. Try again shortly.' });
  }

  const config = await getAiAssistantConfig();
  if (!config) {
    return json(503, headers, {
      success: false,
      error: 'AI assistant is not configured',
    });
  }

  const dayKey = localDayKey();
  const idempotencyKey = sha256(
    `${auth.userId}|crm_chat|${parsed.value.message}|${dayKey}|${Date.now()}`
  ).slice(0, 40);

  const quota = await claimAiQuota({
    actorUserId: auth.userId,
    dayKey,
    requestLimit: config.dailyRequestLimit,
    tokenLimit: config.dailyTokenLimit,
    // A CRM turn can use one planner call plus one answer call.
    reserveTokens: 3200,
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

    const plannerResult = await generateWithProvider(config, {
      operation: 'crm_chat_plan',
      systemInstruction: plannerSystemInstruction(),
      messages: buildPlannerMessages(parsed.value.history, parsed.value.message),
      temperature: 0,
      maxOutputTokens: 700,
      timeoutMs: 15_000,
      responseJsonSchema: CRM_PLANNER_SCHEMA,
    });
    usage = addUsage(usage, plannerResult.usage);
    servedProvider = plannerResult.rawMetadata?.provider || config.provider;
    servedModel = plannerResult.rawMetadata?.model || config.model;
    fellBack = plannerResult.rawMetadata?.fellBack === true;
    const plan = normalizePlannerOutput(
      plannerResult.parsed ||
        (() => {
          try {
            return JSON.parse(plannerResult.text || '{}');
          } catch {
            return {};
          }
        })(),
      parsed.value.message
    );

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
    const userPrompt = buildUserPrompt(
      parsed.value.message,
      contextText,
      parsed.value.history
    );
    promptHash = sha256(userPrompt);

    const providerResult = await generateWithProvider(config, {
      operation: 'crm_chat',
      systemInstruction: buildSystemInstruction(),
      messages: [{ role: 'user', text: userPrompt }],
      temperature: 0.2,
      maxOutputTokens: 2048,
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
      return json(502, headers, { success: false, error: 'AI returned an empty answer' });
    }

    // Hard guarantee: every action still requires human confirmation.
    const proposedActions = (normalized.value.proposedActions || []).map((action) => ({
      ...action,
      requiresConfirm: true,
    }));

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
      entities: {
        customers: pack.customers,
        jobs: pack.jobs,
        reminders: pack.reminders,
        payments: pack.payments,
        documents: pack.documents,
        technicians: pack.technicians,
      },
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
  CRM_CHAT_SCHEMA,
};
