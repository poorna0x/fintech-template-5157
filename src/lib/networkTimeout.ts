// Network Timeout Utility
// Handles slow network scenarios with timeout and retry logic

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Wraps a promise with a timeout
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT,
  errorMessage: string = 'Request timed out'
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${errorMessage} (${timeoutMs}ms)`));
      }, timeoutMs);
    }),
  ]);
};

/**
 * Checks if an error is a timeout error
 */
export const isTimeoutError = (error: any): boolean => {
  return (
    error?.message?.includes('timed out') ||
    error?.message?.includes('timeout') ||
    error?.name === 'TimeoutError'
  );
};

/**
 * Checks if an error is a slow network error (timeout or network related)
 */
export const isSlowNetworkError = (error: any): boolean => {
  return (
    isTimeoutError(error) ||
    error?.message?.includes('network') ||
    error?.message?.includes('fetch') ||
    error?.message?.includes('Failed to fetch') ||
    error?.code === 'NETWORK_ERROR' ||
    (error?.name === 'TypeError' && error?.message?.includes('fetch'))
  );
};

