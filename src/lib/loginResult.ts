/** Result from AuthContext.login — surfaces rate limits and lockout in the UI. */
export interface AuthLoginResult {
  ok: boolean;
  error?: string;
  locked?: boolean;
  retryAfter?: number;
  /** @deprecated Server no longer returns attempt counts (F-18). */
  remainingAttempts?: number;
}

export function formatLoginError(result: AuthLoginResult, fallback: string): string {
  if (result.ok) return '';
  if (result.locked && result.retryAfter) {
    const mins = Math.ceil(result.retryAfter / 60);
    return result.error || `Too many attempts. Try again in about ${mins} minute(s).`;
  }
  if (result.error) {
    return result.error;
  }
  return fallback;
}
