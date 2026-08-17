/**
 * Provider factory — normalized generate() contract.
 * Browser never chooses provider/model.
 */

const { generateWithMock } = require('./ai-provider-mock');
const { generateWithGemini } = require('./ai-provider-gemini');
const { generateWithGroq } = require('./ai-provider-groq');

function buildProviderAttempts(config) {
  const candidates = [
    { provider: config?.provider, model: config?.model },
    ...(Array.isArray(config?.fallbackChain) ? config.fallbackChain : []),
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    const provider = String(candidate?.provider || '');
    const model = String(candidate?.model || '');
    if (!provider || !model) return false;
    const key = `${provider}:${model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRetryableProviderError(error) {
  return error?.retryable === true;
}

async function runProvider(attempt, config, payload) {
  const attemptConfig = {
    ...config,
    provider: attempt.provider,
    model: attempt.model,
  };
  if (attempt.provider === 'mock') return generateWithMock(payload);
  if (attempt.provider === 'gemini') return generateWithGemini(payload, attemptConfig);
  if (attempt.provider === 'groq') return generateWithGroq(payload, attemptConfig);
  throw new Error('Unsupported AI provider');
}

async function generateWithProvider(config, input) {
  if (!config || !config.provider) {
    throw new Error('AI provider not configured');
  }

  const payload = {
    ...input,
    // Hard-block tool calling in v1.
    tools: [],
  };

  const attempts = buildProviderAttempts(config);
  let lastError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      const result = await runProvider(attempt, config, payload);
      return {
        ...result,
        rawMetadata: {
          ...(result.rawMetadata || {}),
          provider: attempt.provider,
          model: attempt.model,
          fellBack: index > 0,
          attempted: attempts
            .slice(0, index + 1)
            .map(({ provider, model }) => ({ provider, model })),
        },
      };
    } catch (error) {
      lastError = error;
      const hasNext = index + 1 < attempts.length;
      if (!hasNext || !isRetryableProviderError(error)) throw error;
    }
  }
  throw lastError || new Error('AI provider unavailable');
}

module.exports = {
  generateWithProvider,
  buildProviderAttempts,
  isRetryableProviderError,
  runProvider,
};
