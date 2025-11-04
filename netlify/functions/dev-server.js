// Simple development server for Netlify functions
// Run with: node netlify/functions/dev-server.js
// This allows local development without Netlify CLI

const http = require('http');
const url = require('url');

// Import function handlers
const altchaVerify = require('./altcha-verify');
const verifyTechnicianPassword = require('./verify-technician-password');
const hashTechnicianPassword = require('./hash-technician-password');

const PORT = 8888;

const server = http.createServer(async (req, res) => {
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

  // Route to appropriate function
  let handler = null;
  if (req.url.startsWith('/.netlify/functions/altcha-verify')) {
    handler = altchaVerify;
  } else if (req.url.startsWith('/.netlify/functions/verify-technician-password')) {
    handler = verifyTechnicianPassword;
  } else if (req.url.startsWith('/.netlify/functions/hash-technician-password')) {
    handler = hashTechnicianPassword;
  }

  if (handler) {
    try {
      const parsedUrl = url.parse(req.url, true);
      
      // Read request body for POST requests
      let body = '';
      if (req.method === 'POST') {
        for await (const chunk of req) {
          body += chunk.toString();
        }
      }

      // Convert to Netlify function event format
      const event = {
        httpMethod: req.method,
        path: req.url,
        queryStringParameters: parsedUrl.query || {},
        headers: req.headers,
        body: body || '{}',
      };

      const context = {};
      
      const result = await handler.handler(event, context);
      
      // Set response headers
      const headers = result.headers || {};
      Object.keys(headers).forEach(key => {
        res.setHeader(key, headers[key]);
      });
      
      res.writeHead(result.statusCode || 200);
      res.end(result.body || '');
    } catch (error) {
      console.error('Function error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Netlify Functions Dev Server running on http://localhost:${PORT}`);
  console.log(`📡 ALTCHA function: http://localhost:${PORT}/.netlify/functions/altcha-verify`);
  console.log(`🔐 Password verification: http://localhost:${PORT}/.netlify/functions/verify-technician-password`);
  console.log(`🔒 Password hashing: http://localhost:${PORT}/.netlify/functions/hash-technician-password`);
  console.log(`\n✅ Keep this running and use 'npm run dev:vite' in another terminal\n`);
});
