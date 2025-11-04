// Security headers helper for Netlify functions
// Provides common security headers to prevent various attacks

/**
 * Get security headers for responses
 * @returns {Object} Security headers object
 */
function getSecurityHeaders() {
  return {
    // Prevent MIME type sniffing (XSS protection)
    'X-Content-Type-Options': 'nosniff',
    
    // Prevent clickjacking attacks
    'X-Frame-Options': 'DENY',
    
    // Enable XSS protection in older browsers
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer policy (don't leak referrer information)
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Content Security Policy (basic - can be customized per endpoint)
    // Note: CSP should be set carefully to avoid breaking functionality
    // 'Content-Security-Policy': "default-src 'self'",
  };
}

/**
 * Add security headers to response headers
 * @param {Object} existingHeaders - Existing response headers
 * @returns {Object} Headers with security headers added
 */
function addSecurityHeaders(existingHeaders = {}) {
  return {
    ...existingHeaders,
    ...getSecurityHeaders()
  };
}

module.exports = {
  getSecurityHeaders,
  addSecurityHeaders
};

