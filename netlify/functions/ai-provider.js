/**
 * Provider factory — normalized generate() contract.
 * Browser never chooses provider/model.
 */

const { generateWithMock } = require('./ai-provider-mock');
const { generateWithGemini } = require('./ai-provider-gemini');

async function generateWithProvider(config, input) {
  if (!config || !config.provider) {
    throw new Error('AI provider not configured');
  }

  const payload = {
    ...input,
    // Hard-block tool calling in v1.
    tools: [],
  };

  if (config.provider === 'mock') {
    return generateWithMock(payload);
  }
  if (config.provider === 'gemini') {
    return generateWithGemini(payload, config);
  }
  throw new Error('Unsupported AI provider');
}

module.exports = {
  generateWithProvider,
};
