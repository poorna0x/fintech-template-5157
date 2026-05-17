// Simple development server for Netlify functions
// Run with: node netlify/functions/dev-server.cjs

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

/** Load .env.local into process.env for function handlers (service role, etc.). */
function loadEnvLocal() {
  const envPath = path.join(__dirname, '../../.env.local');
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
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

// Import function handlers
const altchaVerify = require('./altcha-verify');
const verifyTechnicianPassword = require('./verify-technician-password');
const hashTechnicianPassword = require('./hash-technician-password');
const distanceMatrix = require('./distance-matrix');
const provisionTechnicianAuthOnLogin = require('./provision-technician-auth-on-login');
const syncTechnicianAuthUser = require('./sync-technician-auth-user');
const deleteTechnicianAndData = require('./delete-technician-and-data');
const cloudinaryDelete = require('./cloudinary-delete');
const cloudinarySignedUrl = require('./cloudinary-signed-url');

const PORT = 8888;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
  } else if (req.url.startsWith('/.netlify/functions/verify-technician-password')) {
    handler = verifyTechnicianPassword;
  } else if (req.url.startsWith('/.netlify/functions/hash-technician-password')) {
    handler = hashTechnicianPassword;
  } else if (req.url.startsWith('/.netlify/functions/distance-matrix')) {
    handler = distanceMatrix;
  } else if (req.url.startsWith('/.netlify/functions/provision-technician-auth-on-login')) {
    handler = provisionTechnicianAuthOnLogin;
  } else if (req.url.startsWith('/.netlify/functions/sync-technician-auth-user')) {
    handler = syncTechnicianAuthUser;
  } else if (req.url.startsWith('/.netlify/functions/delete-technician-and-data')) {
    handler = deleteTechnicianAndData;
  } else if (req.url.startsWith('/.netlify/functions/cloudinary-delete')) {
    handler = cloudinaryDelete;
  } else if (req.url.startsWith('/.netlify/functions/cloudinary-signed-url')) {
    handler = cloudinarySignedUrl;
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
        
        // Read request body for POST requests
        let body = '';
        if (req.method === 'POST') {
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
          handler: handler ? 'found' : 'not found'
        });

        // Convert to Netlify function event format
        const event = {
          httpMethod: req.method,
          path: req.url,
          queryStringParameters: parsedUrl.query || {},
          headers: req.headers,
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
        res.end(result.body || '');
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
  console.log(`🔐 Password verification: http://localhost:${PORT}/.netlify/functions/verify-technician-password`);
  console.log(`🔒 Password hashing: http://localhost:${PORT}/.netlify/functions/hash-technician-password`);
  console.log(`📍 Distance Matrix: http://localhost:${PORT}/.netlify/functions/distance-matrix`);
  console.log(
    `👤 Provision technician Auth: http://localhost:${PORT}/.netlify/functions/provision-technician-auth-on-login`
  );
  console.log(
    `🔑 Sync technician Auth: http://localhost:${PORT}/.netlify/functions/sync-technician-auth-user`
  );
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(
    hasServiceKey
      ? '✅ SUPABASE_SERVICE_ROLE_KEY loaded from .env.local'
      : '⚠️  SUPABASE_SERVICE_ROLE_KEY missing — add to .env.local for technician Auth provisioning'
  );
  console.log(`\n✅ Keep this running and use 'npm run dev:vite' in another terminal\n`);
});
