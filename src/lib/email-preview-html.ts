import {
  buildEmailDarkSurfaceCss,
  buildEmailLightSurfaceCss,
} from '@/lib/email-force-light-html';

export type EmailPreviewTheme = 'light' | 'dark';

const LOGO_BLOCK_LIGHT_RE =
  /<table role="presentation"[^>]*\bemail-logo-block-light\b[^>]*>[\s\S]*?<\/table>\s*/i;
const LOGO_BLOCK_DARK_RE =
  /<table role="presentation"[^>]*\bemail-logo-block-dark\b[^>]*>[\s\S]*?<\/table>\s*/i;

function stripInactivePreviewLogo(html: string, theme: EmailPreviewTheme): string {
  return theme === 'dark'
    ? html.replace(LOGO_BLOCK_LIGHT_RE, '')
    : html.replace(LOGO_BLOCK_DARK_RE, '');
}

/**
 * CRM preview — same HTML/assets as sent mail, with theme locked so Light/Dark toggle
 * matches what recipients see on their device.
 */
export function wrapEmailHtmlForPreview(html: string, theme: EmailPreviewTheme): string {
  const rootClass = theme === 'dark' ? 'crm-preview-dark' : 'crm-preview-light';
  const lockRules =
    theme === 'dark'
      ? buildEmailDarkSurfaceCss(`html.${rootClass}`)
      : buildEmailLightSurfaceCss(`html.${rootClass}`);

  const themeCss = `
<style id="crm-email-preview-theme">
  html.${rootClass} { color-scheme: ${theme} !important; }
  ${lockRules}
</style>`;

  if (!html.includes('</head>')) {
    return `${themeCss}${html}`;
  }

  let out = html.replace(/<html([^>]*)>/i, (_match, attrs: string) => {
    if (/class="/i.test(attrs)) {
      return `<html${attrs.replace(/class="([^"]*)"/i, `class="${rootClass} $1"`)}>`;
    }
    return `<html class="${rootClass}"${attrs}>`;
  });

  out = stripInactivePreviewLogo(out, theme);
  out = out.replace('color-scheme:light only', 'color-scheme:light dark');
  return out.replace('</head>', `${themeCss}</head>`);
}
