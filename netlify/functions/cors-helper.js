// CORS helper for secure origin validation
// Only allows requests from allowed origins

// Default allowed origins (for development)
const DEFAULT_ORIGINS = [
  'http://localhost:8080',           // Vite dev server (HTTP)
  'https://localhost:8080',          // Vite dev server (HTTPS)
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
  // TEMPORARY: Allow all origins for debugging - REMOVE IN PRODUCTION!
  if (!isProduction()) {
    return requestOrigin || '*'; // Allow all origins in development
  }

  // If no origin header (same-origin request), allow it
  if (!requestOrigin) {
    return null; // Same-origin requests don't need CORS headers
  }

  // Check if origin is in allowed list
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  // For development, allow localhost with any port (only if not in production)
  // Support both HTTP and HTTPS for localhost
  if (!isProduction() && (requestOrigin.startsWith('http://localhost:') || requestOrigin.startsWith('https://localhost:'))) {
    return requestOrigin;
  }

  // For development, allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) with any port
  // This enables testing from mobile devices on the same network
  // Support both HTTP and HTTPS for local development
  if (!isProduction()) {
    const localNetworkPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?\/?$/;
    if (localNetworkPattern.test(requestOrigin)) {
      return requestOrigin;
    }
  }

  // Origin not allowed
  return null;
}

// Get CORS headers for response
function getCorsHeaders(requestOrigin) {
  // TEMPORARY: Allow all origins for debugging - REMOVE IN PRODUCTION!
  if (!isProduction()) {
    return {
      'Access-Control-Allow-Origin': '*', // Allow all origins in development
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'false',
    };
  }

  // Production code (original logic)
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

