/**
 * supabase-js Realtime always constructs a WebSocket client.
 * Netlify Lambda on Node 20 has no global WebSocket and throws before any RPC.
 * Node 22+ has native WebSocket; `ws` covers older runtimes.
 */
try {
  if (typeof globalThis.WebSocket !== 'function') {
    // eslint-disable-next-line global-require
    globalThis.WebSocket = require('ws');
  }
} catch {
  // Native WebSocket on Node 22 is enough; missing `ws` is then a no-op.
}
