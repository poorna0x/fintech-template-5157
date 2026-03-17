import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a phone number for WhatsApp URL (international format)
 * WhatsApp requires: country code (91 for India) + 10-digit number
 * Format: 91XXXXXXXXXX (12 digits total)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle different phone number formats
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    // Already in correct format: 91XXXXXXXXXX
    return cleaned;
  } else if (cleaned.length === 10) {
    // 10-digit number, prepend country code 91
    return `91${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    // 11-digit number starting with 0, remove 0 and prepend 91
    return `91${cleaned.substring(1)}`;
  } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
    // 13-digit number starting with 91, might have extra digit, take first 12
    return cleaned.substring(0, 12);
  } else if (cleaned.length >= 10) {
    // If it's longer than 10 digits, try to extract last 10 digits and prepend 91
    const last10 = cleaned.substring(cleaned.length - 10);
    return `91${last10}`;
  }
  
  // Fallback: return cleaned as-is (might fail but better than nothing)
  return cleaned;
}

/**
 * Normalize a string for phone-number search (any format → digits only).
 * Handles +91, spaces, leading 0, etc. so "6362 27733", "+91 6362 27733", "0636227733" all become "636227733".
 */
export function normalizePhoneForSearch(input: string | undefined | null): string {
  if (input == null || typeof input !== 'string') return '';
  let digits = input.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length >= 10 && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits;
}

/**
 * Escape a string for safe use inside PostgreSQL LIKE patterns (% and _ are wildcards, \ is escape).
 */
export function escapeForLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
