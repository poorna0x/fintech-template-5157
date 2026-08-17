/**
 * Groq OpenAI-compatible adapter.
 * API key remains server-side and model output is always revalidated upstream.
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_TIMEOUT_MS = 18_000;
const MAX_OUTPUT_TOKENS = 4096;

function createProviderError(message, { retryable = false, code = null } = {}) {
  const error = new Error(message);
  error.retryable = retryable;
  error.providerCode = code;
  return error;
}

function toGroqMessages(systemInstruction, messages) {
  const result = [];
  const system = String(systemInstruction || '').trim();
  if (system) result.push({ role: 'system', content: system });
  for (const message of messages || []) {
    const role = message?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(message?.text || '').trim();
    if (content) result.push({ role, content });
  }
  return result;
}

function extractUsage(data) {
  const usage = data?.usage || {};
  const inputTokens = Number(usage.prompt_tokens) || 0;
  const outputTokens = Number(usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function tryParseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

async function generateWithGroq(input, config) {
  const apiKey = String(config?.groqApiKey || '').trim();
  const model = String(config?.model || 'openai/gpt-oss-120b').trim();
  if (!apiKey) throw createProviderError('Groq API key missing');

  const messages = toGroqMessages(input.systemInstruction, input.messages);
  if (!messages.some((message) => message.role !== 'system')) {
    throw createProviderError('No messages for Groq');
  }

  const requestedOut = Number(input.maxOutputTokens);
  const body = {
    model,
    messages,
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.3,
    max_completion_tokens: Math.min(
      MAX_OUTPUT_TOKENS,
      Number.isFinite(requestedOut) && requestedOut > 0 ? requestedOut : MAX_OUTPUT_TOKENS
    ),
    response_format: { type: 'json_object' },
  };

  let response;
  try {
    response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw createProviderError('Groq request timed out', {
        retryable: true,
        code: 'timeout',
      });
    }
    throw createProviderError('Groq request failed');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || data?.error?.type || response.status;
    const message = String(data?.error?.message || '').toLowerCase();
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('capacity');
    if (retryable) {
      throw createProviderError('Groq rate limit or capacity unavailable', {
        retryable: true,
        code: response.status === 429 ? 429 : code,
      });
    }
    if (response.status === 404 || message.includes('decommissioned')) {
      // A retired model must not break the CRM: let the chain try the next provider.
      throw createProviderError(`Groq model not available (${model})`, {
        retryable: true,
        code,
      });
    }
    if (code === 'json_validate_failed' || message.includes('json')) {
      // The model occasionally emits output that misses the schema. Another
      // attempt or provider usually returns valid JSON, so do not fail the chat.
      throw createProviderError('Groq returned output that did not match the schema', {
        retryable: true,
        code,
      });
    }
    throw createProviderError(`Groq request failed (${code})`, { code });
  }

  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw createProviderError('Groq returned empty output');
  const parsed = tryParseJsonObject(text);

  return {
    text: parsed ? JSON.stringify(parsed) : text,
    parsed,
    toolCalls: [],
    usage: extractUsage(data),
    finishReason: String(data?.choices?.[0]?.finish_reason || 'stop').toLowerCase(),
    providerRequestId: String(data?.id || model),
    rawMetadata: { provider: 'groq', model },
  };
}

module.exports = {
  generateWithGroq,
  createProviderError,
  toGroqMessages,
  extractUsage,
  tryParseJsonObject,
};
