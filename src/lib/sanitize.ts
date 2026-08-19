// HTML sanitization utility using DOMPurify
// Prevents XSS attacks by sanitizing user-generated HTML content

import DOMPurify from 'dompurify';
import { stringifyCustomerAddressForTemplate } from '@/lib/customer-address';

/**
 * Same allow-list as Custom Document / Letterhead rich text editor
 * (bold/italic/lists/headings/links/alignment styles).
 */
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'span',
    'div',
    'strong',
    'em',
    'u',
    's',
    'b',
    'i',
    'h1',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'a',
    'blockquote',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'colspan', 'rowspan'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
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
export function sanitizeForTemplate(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  const str =
    typeof input === 'object'
      ? stringifyCustomerAddressForTemplate(input)
      : String(input);
  if (!str || str === '[object Object]') {
    return '';
  }
  return escapeHTML(str);
}

/** True when the string already contains HTML tags (vs plain Additional Info notes). */
export function looksLikeHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Strip tags for emptiness checks (Add Note disabled when only whitespace/tags). */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|th|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize Additional Info / notes HTML for safe PDF and preview rendering.
 * Plain-text notes keep line breaks as <br/>.
 */
export function sanitizeNotesHtml(notes: string | null | undefined): string {
  if (!notes) return '';
  if (looksLikeHtml(notes)) {
    return sanitizeHTML(notes, true);
  }
  return escapeHTML(notes).replace(/\n/g, '<br/>');
}

/** Join an array of note blocks for document/PDF storage, preserving rich formatting. */
export function joinNotesHtml(notes: string[]): string {
  return notes
    .map((note) => (note || '').trim())
    .filter((note) => stripHtmlToText(note).length > 0)
    .map((note) => {
      const inner = looksLikeHtml(note)
        ? note
        : escapeHTML(note).replace(/\n/g, '<br/>');
      return `<div class="note-block">${inner}</div>`;
    })
    .join('');
}

