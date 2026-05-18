/** Client-side job number prefix for booking UI (not a secret; job create uses server RPC). */
export function generateJobNumber(
  serviceType: string,
  year: number = new Date().getFullYear()
): string {
  const prefix = serviceType.toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${year}-${timestamp}`;
}
