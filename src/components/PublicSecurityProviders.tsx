import type { ReactNode } from 'react';
import { SecurityProvider } from '@/contexts/SecurityContext';

/**
 * Public forms (book / warranty / authenticity / privacy-request) need ALTCHA
 * + honeypot state, but must not pull AuthProvider into the marketing graph.
 */
export default function PublicSecurityProviders({ children }: { children: ReactNode }) {
  return <SecurityProvider>{children}</SecurityProvider>;
}
