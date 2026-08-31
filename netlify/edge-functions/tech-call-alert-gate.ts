/**
 * Platform rate-limit for technician call alerts.
 * Over-limit requests are rejected at the Edge (no serverless invocation).
 * Under-limit traffic continues to tech-call-customer-alert.js.
 *
 * Cap is per IP per minute — high enough for real rings (even shared NAT),
 * low enough to stop the old APK watch/retry spam (tens–hundreds/min).
 */
import type { Config, Context } from '@netlify/edge-functions';

export default async function handler(_request: Request, context: Context) {
  return context.next();
}

export const config: Config = {
  path: '/.netlify/functions/tech-call-customer-alert',
  rateLimit: {
    windowLimit: 40,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
