function titleCaseWord(word: string): string {
  const w = word.trim().toLowerCase();
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Turn "poorna_kumar" / "poorna.kumar" / "POORNA" into "Poorna Kumar". */
function formatNameParts(raw: string): string {
  return raw
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map(titleCaseWord)
    .join(' ');
}

/**
 * Friendly name for login toasts: metadata full name, else email local-part before @.
 * e.g. srujanshetty@hydrogenro.com → "Srujanshetty", poorna.kumar@… → "Poorna Kumar"
 */
export function formatWelcomeDisplayName(input: {
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
  fallback?: string;
}): string {
  const fromMeta = input.fullName?.trim() || input.name?.trim();
  if (fromMeta) {
    const formatted = formatNameParts(fromMeta);
    if (formatted) return formatted;
  }

  const email = input.email?.trim();
  if (email?.includes('@')) {
    const local = email.split('@')[0]?.trim();
    if (local) {
      const formatted = formatNameParts(local);
      if (formatted) return formatted;
    }
  }

  if (email) {
    const formatted = formatNameParts(email);
    if (formatted) return formatted;
  }

  return input.fallback ?? 'there';
}
