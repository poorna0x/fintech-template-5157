/** Result from AuthContext.login — surfaces rate limits and lockout in the UI. */
export interface AuthLoginResult {
  ok: boolean;
  error?: string;
  locked?: boolean;
  retryAfter?: number;
  remainingAttempts?: number;
}

export function formatLoginError(result: AuthLoginResult, fallback: string): string {
  if (result.ok) return '';
  if (result.error && result.error !== 'Invalid email or password') {
    return result.error;
  }
  if (result.locked && result.retryAfter) {
    const mins = Math.ceil(result.retryAfter / 60);
    return result.error || `Too many attempts. Try again in about ${mins} minute(s).`;
  }
  if (result.remainingAttempts != null && result.remainingAttempts > 0) {
    return `Invalid email or password. ${result.remainingAttempts} attempt(s) remaining before lockout.`;
  }
  if (result.remainingAttempts === 0) {
    return 'Invalid email or password. Account will be locked on the next failed attempt.';
  }
  return result.error || fallback;
}
