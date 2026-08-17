// Simple development server for Netlify functions
// Run with: node netlify/functions/dev-server.cjs

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

/** Load .env then .env.local so local functions get the same Maps key as Vite. */
function loadEnvFile(envPath, override = false) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (override || !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, '../../.env'));
loadEnvFile(path.join(__dirname, '../../.env.local'), true);

// Import function handlers
const altchaVerify = require('./altcha-verify');
const distanceMatrix = require('./distance-matrix');
const secureAuthLogin = require('./secure-auth-login');
const syncPortalSession = require('./sync-portal-session');
const clearPortalSession = require('./clear-portal-session');
const syncTechnicianAuthUser = require('./sync-technician-auth-user');
const deleteTechnicianAndData = require('./delete-technician-and-data');
const cloudinaryDelete = require('./cloudinary-delete');
const cloudinarySignedUrl = require('./cloudinary-signed-url');
const bookingIntent = require('./booking-intent');
const bookingJobCreate = require('./booking-job-create');
const privacyRequest = require('./privacy-request');
const privacyDataExport = require('./privacy-data-export');
const privacyCustomerAnonymize = require('./privacy-customer-anonymize');
const bookingCustomerMutate = require('./booking-customer-mutate');
const bookingCustomerLookup = require('./booking-customer-lookup');
const bookingNotify = require('./booking-notify');
const warrantyLookup = require('./warranty-lookup');
const saveAmcContract = require('./save-amc-contract');
const sendEmailPreview = require('./send-email-preview');
// Push notification senders (FCM credential comes from app_secrets via the
// service role key, so these work locally as long as .env.local is present).
const sendTechPush = require('./send-tech-push');
const sendOtpRequest = require('./send-otp-request');
const submitTechMessageReply = require('./submit-tech-message-reply');
const submitAdminMessageReply = require('./submit-admin-message-reply');
const notifyAdmins = require('./notify-admins');
const sendLocationPing = require('./send-location-ping');
const whatsappSend = require('./whatsapp-send');
const whatsappWebhook = require('./whatsapp-webhook');
const whatsappEvents = require('./whatsapp-events');
const whatsappTemplates = require('./whatsapp-templates');
const whatsappR2SignedUrl = require('./whatsapp-r2-signed-url');
const whatsappPurgeMessages = require('./whatsapp-purge-messages');
const whatsappBookingStart = require('./whatsapp-booking-start');
const dialCall = require('./dial-call');
const pdfAuthenticityOtpVerify = require('./pdf-authenticity-otp-verify');
const pdfAuthenticityCheck = require('./pdf-authenticity-check');
const documentAcceptSend = require('./document-accept-send');
const documentAcceptEmailSend = require('./document-accept-email-send');
const documentAcceptPublic = require('./document-accept-public');
const whatsappTrayClearPush = require('./whatsapp-tray-clear-push');
const whatsappInboxApplyToCustomer = require('./whatsapp-inbox-apply-to-customer');
const salarySlipMonthEnd = require('./salary-slip-month-end');

function loadFn(name) {
  const resolved = require.resolve(`./${name}`);
  delete require.cache[resolved];
  return require(`./${name}`);
}

const PORT = 8888;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Email-Preview-Secret'
  );

  // Handle OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle errors on request stream
  req.on('error', (error) => {
    console.error('Request error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request error', details: error.message }));
    }
  });

  // Route to appropriate function
  let handler = null;
  if (req.url.startsWith('/.netlify/functions/altcha-verify')) {
    handler = altchaVerify;
  } else if (req.url.startsWith('/.netlify/functions/distance-matrix')) {
    handler = distanceMatrix;
  } else if (req.url.startsWith('/.netlify/functions/secure-auth-login')) {
    handler = secureAuthLogin;
  } else if (req.url.startsWith('/.netlify/functions/sync-portal-session')) {
    handler = syncPortalSession;
  } else if (req.url.startsWith('/.netlify/functions/clear-portal-session')) {
    handler = clearPortalSession;
  } else if (req.url.startsWith('/.netlify/functions/sync-technician-auth-user')) {
    handler = syncTechnicianAuthUser;
  } else if (req.url.startsWith('/.netlify/functions/delete-technician-and-data')) {
    handler = deleteTechnicianAndData;
  } else if (req.url.startsWith('/.netlify/functions/cloudinary-delete')) {
    handler = cloudinaryDelete;
  } else if (req.url.startsWith('/.netlify/functions/cloudinary-signed-url')) {
    handler = cloudinarySignedUrl;
  } else if (req.url.startsWith('/.netlify/functions/booking-intent')) {
    handler = bookingIntent;
  } else if (req.url.startsWith('/.netlify/functions/booking-job-create')) {
    handler = bookingJobCreate;
  } else if (req.url.startsWith('/.netlify/functions/privacy-data-export')) {
    handler = loadFn('privacy-data-export');
  } else if (req.url.startsWith('/.netlify/functions/privacy-customer-anonymize')) {
    handler = loadFn('privacy-customer-anonymize');
  } else if (req.url.startsWith('/.netlify/functions/privacy-request')) {
    handler = loadFn('privacy-request');
  } else if (req.url.startsWith('/.netlify/functions/booking-customer-mutate')) {
    handler = bookingCustomerMutate;
  } else if (req.url.startsWith('/.netlify/functions/booking-customer-lookup')) {
    handler = bookingCustomerLookup;
  } else if (req.url.startsWith('/.netlify/functions/booking-notify')) {
    handler = bookingNotify;
  } else if (req.url.startsWith('/.netlify/functions/warranty-lookup')) {
    handler = warrantyLookup;
  } else if (req.url.startsWith('/.netlify/functions/generate-pdf')) {
    delete require.cache[require.resolve('./ilovepdf-compress-helper')];
    delete require.cache[require.resolve('./pdf-compression-setting')];
    handler = loadFn('generate-pdf');
  } else if (req.url.startsWith('/.netlify/functions/save-amc-contract')) {
    handler = saveAmcContract;
  } else if (req.url.startsWith('/.netlify/functions/send-email-preview')) {
    handler = sendEmailPreview;
  } else if (req.url.startsWith('/.netlify/functions/send-tech-push')) {
    handler = sendTechPush;
  } else if (req.url.startsWith('/.netlify/functions/send-otp-request')) {
    handler = sendOtpRequest;
  } else if (req.url.startsWith('/.netlify/functions/submit-tech-message-reply')) {
    handler = submitTechMessageReply;
  } else if (req.url.startsWith('/.netlify/functions/submit-admin-message-reply')) {
    handler = submitAdminMessageReply;
  } else if (req.url.startsWith('/.netlify/functions/notify-admins')) {
    delete require.cache[require.resolve('./notify-admins')];
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./fcm-helper')];
    delete require.cache[require.resolve('./push-prefs-helper')];
    handler = require('./notify-admins');
  } else if (req.url.startsWith('/.netlify/functions/job-review-public')) {
    delete require.cache[require.resolve('./job-review-public')];
    delete require.cache[require.resolve('./cors-helper')];
    delete require.cache[require.resolve('./rate-limiter')];
    handler = require('./job-review-public');
  } else if (req.url.startsWith('/.netlify/functions/job-review-invite')) {
    delete require.cache[require.resolve('./job-review-invite')];
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./cors-helper')];
    delete require.cache[require.resolve('./rate-limiter')];
    handler = require('./job-review-invite');
  } else if (req.url.startsWith('/.netlify/functions/job-review-notify')) {
    delete require.cache[require.resolve('./job-review-notify')];
    delete require.cache[require.resolve('./fcm-helper')];
    delete require.cache[require.resolve('./push-prefs-helper')];
    delete require.cache[require.resolve('./rate-limiter')];
    handler = require('./job-review-notify');
  } else if (req.url.startsWith('/.netlify/functions/send-location-ping')) {
    handler = sendLocationPing;
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-send')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./whatsapp-unsolicited-media')];
    delete require.cache[require.resolve('./whatsapp-pay-qr-helper')];
    handler = loadFn('whatsapp-send');
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-webhook')) {
    delete require.cache[require.resolve('./whatsapp-unsolicited-media')];
    delete require.cache[require.resolve('./whatsapp-pay-qr-helper')];
    delete require.cache[require.resolve('./whatsapp-booking-bot')];
    delete require.cache[require.resolve('./whatsapp-eleven-support')];
    handler = loadFn('whatsapp-webhook');
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-events')) {
    handler = whatsappEvents;
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-templates')) {
    handler = whatsappTemplates;
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-r2-signed-url')) {
    handler = whatsappR2SignedUrl;
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-purge-messages')) {
    // Reload so local edits to messageId purge actually delete R2, not the old handler.
    delete require.cache[require.resolve('./whatsapp-purge-messages')];
    handler = require('./whatsapp-purge-messages');
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-booking-start')) {
    delete require.cache[require.resolve('./whatsapp-booking-bot')];
    delete require.cache[require.resolve('./whatsapp-template-resolve')];
    handler = loadFn('whatsapp-booking-start');
  } else if (req.url.startsWith('/.netlify/functions/dial-call')) {
    handler = dialCall;
  } else if (req.url.startsWith('/.netlify/functions/pdf-authenticity-otp-verify')) {
    handler = pdfAuthenticityOtpVerify;
  } else if (req.url.startsWith('/.netlify/functions/pdf-authenticity-check')) {
    handler = pdfAuthenticityCheck;
  } else if (req.url.startsWith('/.netlify/functions/document-accept-send')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    handler = loadFn('document-accept-send');
  } else if (req.url.startsWith('/.netlify/functions/document-accept-email-send')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    handler = loadFn('document-accept-email-send');
  } else if (req.url.startsWith('/.netlify/functions/document-accept-public')) {
    handler = loadFn('document-accept-public');
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-tray-clear-push')) {
    handler = whatsappTrayClearPush;
  } else if (req.url.startsWith('/.netlify/functions/whatsapp-inbox-apply-to-customer')) {
    delete require.cache[require.resolve('./resolve-maps-link')];
    delete require.cache[require.resolve('./whatsapp-location-enrich')];
    handler = loadFn('whatsapp-inbox-apply-to-customer');
  } else if (req.url.startsWith('/.netlify/functions/geocode')) {
    handler = loadFn('geocode');
  } else if (req.url.startsWith('/.netlify/functions/resolve-maps-link')) {
    handler = loadFn('resolve-maps-link');
  } else if (req.url.startsWith('/.netlify/functions/db-storage-stats')) {
    delete require.cache[require.resolve('./r2-helper')];
    handler = loadFn('db-storage-stats');
  } else if (req.url.startsWith('/.netlify/functions/cloudinary-usage')) {
    delete require.cache[require.resolve('./cloudinary-usage-helper')];
    handler = loadFn('cloudinary-usage');
  } else if (req.url.startsWith('/.netlify/functions/ilovepdf-usage')) {
    delete require.cache[require.resolve('./ilovepdf-compress-helper')];
    delete require.cache[require.resolve('./pdf-compression-setting')];
    handler = loadFn('ilovepdf-usage');
  } else if (req.url.startsWith('/.netlify/functions/ai-inbox-suggest')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./ai-config')];
    delete require.cache[require.resolve('./ai-provider')];
    delete require.cache[require.resolve('./ai-provider-mock')];
    delete require.cache[require.resolve('./ai-provider-gemini')];
    delete require.cache[require.resolve('./ai-provider-groq')];
    delete require.cache[require.resolve('./ai-schemas')];
    delete require.cache[require.resolve('./ai-audit')];
    delete require.cache[require.resolve('./ai-inbox-suggest')];
    handler = loadFn('ai-inbox-suggest');
  } else if (req.url.startsWith('/.netlify/functions/ai-crm-chat')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./ai-config')];
    delete require.cache[require.resolve('./ai-provider')];
    delete require.cache[require.resolve('./ai-provider-mock')];
    delete require.cache[require.resolve('./ai-provider-gemini')];
    delete require.cache[require.resolve('./ai-provider-groq')];
    delete require.cache[require.resolve('./ai-crm-schemas')];
    delete require.cache[require.resolve('./ai-crm-lookup')];
    delete require.cache[require.resolve('./ai-audit')];
    delete require.cache[require.resolve('./ai-crm-chat')];
    handler = loadFn('ai-crm-chat');
  } else if (req.url.startsWith('/.netlify/functions/ai-document-draft')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./ai-config')];
    delete require.cache[require.resolve('./ai-provider')];
    delete require.cache[require.resolve('./ai-provider-mock')];
    delete require.cache[require.resolve('./ai-provider-gemini')];
    delete require.cache[require.resolve('./ai-provider-groq')];
    delete require.cache[require.resolve('./ai-audit')];
    delete require.cache[require.resolve('./ai-document-draft-schemas')];
    delete require.cache[require.resolve('./ai-document-draft')];
    handler = loadFn('ai-document-draft');
  } else if (req.url.startsWith('/.netlify/functions/ai-usage')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./ai-config')];
    delete require.cache[require.resolve('./ai-audit')];
    delete require.cache[require.resolve('./ai-usage')];
    handler = loadFn('ai-usage');
  } else if (req.url.startsWith('/.netlify/functions/ai-config-save')) {
    delete require.cache[require.resolve('./admin-auth-guard')];
    delete require.cache[require.resolve('./ai-config')];
    delete require.cache[require.resolve('./ai-config-save')];
    handler = loadFn('ai-config-save');
  } else if (req.url.startsWith('/.netlify/functions/salary-slip-month-end')) {
    handler = salarySlipMonthEnd;
  } else {
    console.log('⚠️ No handler found for:', req.url);
  }

  if (handler) {
    // Use async IIFE to handle async operations
    (async () => {
      let responseSent = false;
      
      const sendError = (error) => {
        if (responseSent) return;
        responseSent = true;
        console.error('❌ Function error:', error);
        console.error('Error stack:', error.stack);
        try {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Internal server error', 
            details: error.message,
            stack: error.stack
          }));
        } catch (e) {
          console.error('Failed to send error response:', e);
        }
      };

      try {
        const parsedUrl = url.parse(req.url, true);
        
        // Read request body for mutating methods
        let body = '';
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
          try {
            for await (const chunk of req) {
              body += chunk.toString();
            }
          } catch (readError) {
            console.error('Error reading request body:', readError);
            // Continue with empty body if read fails
          }
        }

    console.log('📥 Received request:', {
      method: req.method,
      url: req.url,
      bodyLength: body.length,
      source: (() => {
        try {
          return JSON.parse(body || '{}').source || null;
        } catch {
          return null;
        }
      })(),
      handler: handler ? 'found' : 'not found'
    });

        // Convert to Netlify function event format
        const clientIp =
          req.headers['x-forwarded-for'] ||
          req.socket?.remoteAddress ||
          '127.0.0.1';
        const event = {
          httpMethod: req.method,
          path: req.url,
          queryStringParameters: parsedUrl.query || {},
          headers: {
            ...req.headers,
            'x-forwarded-for': clientIp,
          },
          body: body || '{}',
        };

        const context = {};
        
        // Call the handler function
        const result = await handler.handler(event, context);
        
        if (responseSent) return; // Don't send response if already sent
        
        console.log('✅ Function result:', {
          statusCode: result.statusCode,
          hasBody: !!result.body,
          bodyLength: result.body?.length || 0
        });
        
        // Set response headers
        const headers = result.headers || {};
        Object.keys(headers).forEach(key => {
          res.setHeader(key, headers[key]);
        });
        
        responseSent = true;
        res.writeHead(result.statusCode || 200);
        if (result.isBase64Encoded && result.body) {
          res.end(Buffer.from(result.body, 'base64'));
        } else {
          res.end(result.body || '');
        }
      } catch (error) {
        sendError(error);
      }
    })();
  } else {
    const fnName = (req.url || '').replace('/.netlify/functions/', '').split('?')[0];
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not found',
        hint: fnName
          ? `Function "${fnName}" is not registered. Stop and run: npm run dev`
          : 'Unknown function path',
      })
    );
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n❌ Port ${PORT} is already in use (old dev-server still running).\n` +
        `   Run: npm run dev:kill-stale\n` +
        `   Or:  lsof -ti:${PORT} | xargs kill -9\n` +
        `   Then start again: npm run dev\n`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  // Get all local IP addresses
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    });
  });
  
  console.log(`🚀 Netlify Functions Dev Server running on http://localhost:${PORT}`);
  if (addresses.length > 0) {
    addresses.forEach((addr) => {
      console.log(`   Also accessible at http://${addr}:${PORT}`);
    });
  }
  console.log(`📡 ALTCHA function: http://localhost:${PORT}/.netlify/functions/altcha-verify`);
  console.log(`📍 Distance Matrix: http://localhost:${PORT}/.netlify/functions/distance-matrix`);
  console.log(
    `💬 WhatsApp send POC: http://localhost:${PORT}/.netlify/functions/whatsapp-send`
  );
  console.log(
    `🔐 Secure auth login: http://localhost:${PORT}/.netlify/functions/secure-auth-login`
  );
  console.log(
    `🔑 Sync technician Auth: http://localhost:${PORT}/.netlify/functions/sync-technician-auth-user`
  );
  console.log(
    `📄 Document Accept send: http://localhost:${PORT}/.netlify/functions/document-accept-send`
  );
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(
    hasServiceKey
      ? '✅ SUPABASE_SERVICE_ROLE_KEY loaded from .env.local'
      : '⚠️  SUPABASE_SERVICE_ROLE_KEY missing — add to .env.local for technician Auth provisioning'
  );
  console.log(`\n✅ Keep this running and use 'npm run dev:vite' in another terminal\n`);
});
