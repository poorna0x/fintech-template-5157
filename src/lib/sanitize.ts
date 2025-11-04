// HTML sanitization utility using DOMPurify
// Prevents XSS attacks by sanitizing user-generated HTML content

import DOMPurify from 'dompurify';

/**
 * Configuration for sanitizing rich text content (allows basic formatting)
 */
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  ALLOWED_ATTR: ['class', 'style'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Configuration for sanitizing plain text with minimal formatting
 */
const PLAIN_TEXT_CONFIG = {
  ALLOWED_TAGS: ['strong', 'em', 'u', 'b', 'i', 'p', 'br'],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows basic formatting tags for rich text
 * 
 * @param html - The HTML string to sanitize
 * @param allowRichText - If true, allows more formatting tags (default: false)
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHTML(html: string, allowRichText: boolean = false): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = allowRichText ? RICH_TEXT_CONFIG : PLAIN_TEXT_CONFIG;
  return DOMPurify.sanitize(html, config);
}

/**
 * Sanitize plain text by escaping HTML entities
 * Use this when you want to display text without any HTML tags
 * Works in both browser and Node.js environments
 * 
 * @param text - The text to escape
 * @returns Escaped text safe for rendering
 */
export function escapeHTML(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Escape HTML entities manually (works in both browser and Node.js)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize user input for use in HTML templates
 * Escapes special characters to prevent injection
 * 
 * @param input - The input string to sanitize
 * @returns Sanitized string safe for HTML templates
 */
export function sanitizeForTemplate(input: string | number | undefined | null): string {
  if (input === null || input === undefined) {
    return '';
  }

  const str = String(input);
  return escapeHTML(str);
}

