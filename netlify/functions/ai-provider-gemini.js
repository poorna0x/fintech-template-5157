/**
 * Gemini REST adapter (provider-neutral contract).
 * API key is sent via header, never logged.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 18_000;
// Gemini 2.5+/3.x thinking can consume most of a small budget before JSON is emitted.
const MAX_OUTPUT_TOKENS = 4096;

function toGeminiContents(messages) {
  const contents = [];
  for (const msg of messages || []) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = String(msg.text || '').trim();
    if (!text) continue;
    contents.push({
      role,
      parts: [{ text }],
    });
  }
  return contents;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractUsage(data) {
  const u = data?.usageMetadata || {};
  const inputTokens = Number(u.promptTokenCount) || 0;
  const outputTokens = Number(u.candidatesTokenCount) || 0;
  const totalTokens = Number(u.totalTokenCount) || inputTokens + outputTokens;
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

async function generateWithGemini(input, config) {
  const apiKey = String(config?.geminiApiKey || '').trim();
  const model = String(config?.model || 'gemini-3.1-flash-lite').trim();
  if (!apiKey) {
    throw new Error('Gemini API key missing');
  }

  const systemInstruction = String(input.systemInstruction || '').trim();
  const contents = toGeminiContents(input.messages);
  if (!contents.length) {
    throw new Error('No messages for Gemini');
  }

  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const requestedOut = Number(input.maxOutputTokens);
  const body = {
    contents,
    generationConfig: {
      temperature: typeof input.temperature === 'number' ? input.temperature : 0.3,
      maxOutputTokens: Math.min(
        MAX_OUTPUT_TOKENS,
        Number.isFinite(requestedOut) && requestedOut > 0 ? requestedOut : MAX_OUTPUT_TOKENS
      ),
      responseMimeType: 'application/json',
      // Draft JSON does not need extended thinking; keep output for the reply payload.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  // Only server-owned schemas are passed here; the browser cannot supply one.
  if (input.responseJsonSchema && typeof input.responseJsonSchema === 'object') {
    body.generationConfig.responseJsonSchema = input.responseJsonSchema;
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const timeoutMs = Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.status || data?.error?.code || response.status;
    const msg = String(data?.error?.message || '').toLowerCase();
    if (response.status === 429 || msg.includes('quota') || msg.includes('credit') || msg.includes('billing')) {
      throw new Error('Gemini quota/billing unavailable — top up credits in AI Studio, then retry');
    }
    if (response.status === 404 || String(code).includes('NOT_FOUND')) {
      throw new Error(`Gemini model not available (${model})`);
    }
    throw new Error(`Gemini request failed (${code})`);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error('Gemini returned empty output');
  }

  // Prefer structured object when available; orchestrator still re-validates.
  const parsed = tryParseJsonObject(text);

  return {
    text: parsed ? JSON.stringify(parsed) : text,
    parsed,
    toolCalls: [],
    usage: extractUsage(data),
    finishReason: String(data?.candidates?.[0]?.finishReason || 'stop').toLowerCase(),
    providerRequestId: String(data?.responseId || data?.modelVersion || model),
    rawMetadata: { provider: 'gemini', model },
  };
}

module.exports = {
  generateWithGemini,
  tryParseJsonObject,
  toGeminiContents,
  extractUsage,
};
