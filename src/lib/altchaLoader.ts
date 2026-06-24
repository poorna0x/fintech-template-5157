let altchaReady: Promise<void> | null = null;

/** Load ALTCHA web component + styles only on pages that need captcha (not the public homepage entry). */
export function ensureAltchaLoaded(): Promise<void> {
  if (!altchaReady) {
    altchaReady = Promise.all([import('altcha'), import('altcha/altcha.css')]).then(() => undefined);
  }
  return altchaReady;
}
