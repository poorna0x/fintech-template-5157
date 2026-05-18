// Deprecated duplicate — use netlify/functions/send-email.js (secured, ALTCHA-gated).
exports.handler = async () => ({
  statusCode: 410,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'This endpoint has been retired. Use /.netlify/functions/send-email.' }),
});
