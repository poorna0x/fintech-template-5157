// Security headers helper for Netlify functions
// Provides common security headers to prevent various attacks

// geolocation/camera=(self): booking + technician flows; all other sensitive APIs denied
const PERMISSIONS_POLICY =
  'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), bluetooth=(), ' +
  'camera=(self), clipboard-read=(), clipboard-write=(self), compute-pressure=(), ' +
  'display-capture=(), encrypted-media=(), fullscreen=(self), gamepad=(), geolocation=(self), ' +
  'gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), ' +
  'magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), ' +
  'picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), ' +
  'screen-wake-lock=(), serial=(), speaker-selection=(), sync-xhr=(), usb=(), web-share=(), ' +
  'window-management=(), xr-spatial-tracking=()';

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

