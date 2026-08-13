/**
 * HTTPS → tel: redirect so WhatsApp CTA "Call us" can open the phone dialer.
 * GET /.netlify/functions/dial-call
 * Optional ?n=9880693311 (10-digit IN) — default Eleven main line.
 */
const DEFAULT_DIGITS = '9880693311';

exports.handler = async (event) => {
  const raw = String(event?.queryStringParameters?.n || DEFAULT_DIGITS).replace(/\D/g, '');
  let digits = raw;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) digits = DEFAULT_DIGITS;

  const tel = `tel:+91${digits}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Calling…</title>
<script>location.replace(${JSON.stringify(tel)});</script>
</head><body style="font-family:system-ui;padding:2rem;text-align:center">
<p>Opening dialer…</p>
<p><a href="${tel}">Tap here if the dialer did not open</a></p>
</body></html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: html,
  };
};
