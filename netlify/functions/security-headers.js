// Security headers helper for Netlify functions
// Provides common security headers to prevent various attacks

// geolocation/camera=(self): booking + technician flows; omit deprecated/unrecognized features
const PERMISSIONS_POLICY =
  'accelerometer=(), autoplay=(), bluetooth=(), camera=(self), clipboard-read=(self), ' +
  'clipboard-write=(self), display-capture=(), encrypted-media=(), fullscreen=(self), ' +
  'geolocation=(self), gyroscope=(), microphone=(), midi=(), payment=(), picture-in-picture=(), ' +
  'publickey-credentials-create=(self), publickey-credentials-get=(self), usb=(), web-share=()';

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
    
    // Referrer policy (don't leak referrer information)
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    'Permissions-Policy': PERMISSIONS_POLICY,
    
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
  PERMISSIONS_POLICY,
  getSecurityHeaders,
  addSecurityHeaders,
};

