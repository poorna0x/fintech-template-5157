// CORS helper for secure origin validation
// Only allows requests from allowed origins

// Default allowed origins (for development)
const DEFAULT_ORIGINS = [
  'http://localhost:8080',           // Vite dev server (configured in vite.config.ts)
  'http://localhost:5173',            // Vite default dev port
  'http://localhost:3000',           // Alternative dev port
  'http://localhost:8888',           // Netlify functions dev server
];

// Detect if we're in production
function isProduction() {
  // Netlify sets CONTEXT to 'production' in production builds
  // Also check NODE_ENV as fallback
  return process.env.CONTEXT === 'production' || 
         process.env.NODE_ENV === 'production' ||
         process.env.NETLIFY === 'true'; // Netlify sets this in production
}

// Get allowed origins from environment variable or use defaults
function getAllowedOrigins() {
  // Read from environment variable (comma-separated list)
  const envOrigins = process.env.ALLOWED_ORIGINS;
  const inProduction = isProduction();
  
  if (envOrigins) {
    // Parse comma-separated origins from environment variable
    const origins = envOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
    
    // In production, only use env origins (no localhost)
    if (inProduction) {
      return origins;
    }
    
    // In development, combine with localhost origins
    return [...DEFAULT_ORIGINS, ...origins];
  }
  
  // Fallback: production domains
  if (inProduction) {
    return [
      'https://hydrogenro.com',           // Production domain
      'https://www.hydrogenro.com',       // Production domain with www
    ];
  }
  
  // Development fallback: include localhost
  return [
    ...DEFAULT_ORIGINS,
    'https://hydrogenro.com',           // Production domain (for testing)
    'https://www.hydrogenro.com',       // Production domain with www
  ];
}

const ALLOWED_ORIGINS = getAllowedOrigins();

// Get allowed origin based on request
function getAllowedOrigin(requestOrigin) {
  // If no origin header (same-origin request), allow it
  if (!requestOrigin) {
    return null; // Same-origin requests don't need CORS headers
  }

  // Check if origin is in allowed list
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  // For development, allow localhost with any port (only if not in production)
  if (!isProduction() && requestOrigin.startsWith('http://localhost:')) {
    return requestOrigin;
  }

  // Origin not allowed
  return null;
}

// Get CORS headers for response
function getCorsHeaders(requestOrigin) {
  const allowedOrigin = getAllowedOrigin(requestOrigin);
  
  if (!allowedOrigin) {
    // Return minimal headers if origin not allowed (will be rejected by browser)
    return {
      'Access-Control-Allow-Origin': 'null',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'false',
    };
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'false',
  };
}

// Check if request origin is allowed
function isOriginAllowed(requestOrigin) {
  return getAllowedOrigin(requestOrigin) !== null;
}

module.exports = {
  getAllowedOrigin,
  getCorsHeaders,
  isOriginAllowed,
};

