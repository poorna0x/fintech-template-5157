import {
  buildEmailDarkSurfaceCss,
  buildEmailLightSurfaceCss,
} from '@/lib/email-force-light-html';

export type EmailPreviewTheme = 'light' | 'dark';

/**
 * CRM preview — same CSS as sent mail, locked via class so it matches regardless of OS theme.
 * Light preview uses buildEmailLightSurfaceCss (same as sent mail in light mode).
 * Dark preview uses buildEmailDarkSurfaceCss (same as sent mail @media dark).
 */
function buildPreviewThemeCss(theme: EmailPreviewTheme): string {
  const rootClass = theme === 'dark' ? 'crm-preview-dark' : 'crm-preview-light';
  const rules =
    theme === 'dark'
      ? buildEmailDarkSurfaceCss(`html.${rootClass}`)
      : buildEmailLightSurfaceCss(`html.${rootClass}`);

  return `
<style id="crm-email-preview-theme">
  html.${rootClass} { color-scheme: ${theme} !important; }
  ${rules}
</style>`;
}

export function wrapEmailHtmlForPreview(html: string, theme: EmailPreviewTheme): string {
  const rootClass = theme === 'dark' ? 'crm-preview-dark' : 'crm-preview-light';
  const themeCss = buildPreviewThemeCss(theme);

  if (!html.includes('</head>')) {
    return `${themeCss}${html}`;
  }

  let out = html.replace('<html', `<html class="${rootClass}"`);
  if (!out.includes(`class="${rootClass}"`)) {
    out = out.replace('<html class="', `<html class="${rootClass} `);
  }
  out = out.replace('color-scheme:light only', 'color-scheme:light dark');
  return out.replace('</head>', `${themeCss}</head>`);
}
