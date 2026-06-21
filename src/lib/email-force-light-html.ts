/** Shared head/styles so CRM emails stay light in Apple Mail / Gmail dark mode. */

export const EMAIL_PAGE_BG = '#f3f3f4';
export const EMAIL_CARD_BG = '#ffffff';
export const EMAIL_FOOTER_BG = '#fafafa';
export const EMAIL_DETAILS_BG = '#fafafa';
export const EMAIL_HEADING = '#0a0a0a';
export const EMAIL_BODY = '#525252';
export const EMAIL_LABEL = '#737373';

/** Meta + CSS — insert inside <head> of every customer-facing HTML email. */
export function buildEmailForceLightHead(): string {
  return `
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style type="text/css">
    :root {
      color-scheme: light only;
      supported-color-schemes: light only;
    }
    html, body {
      color-scheme: light only !important;
      background-color: ${EMAIL_PAGE_BG} !important;
    }
    @media (prefers-color-scheme: dark) {
      html, body {
        background-color: ${EMAIL_PAGE_BG} !important;
        color: ${EMAIL_BODY} !important;
      }
      .email-force-light,
      .email-force-light table,
      .email-force-light td,
      .email-force-light p,
      .email-force-light h1,
      .email-force-light strong,
      .email-force-light span {
        color-scheme: light only !important;
      }
      .email-force-light-page,
      .email-force-light-page > tbody > tr > td {
        background-color: ${EMAIL_PAGE_BG} !important;
      }
      .email-force-light-card,
      .email-force-light-card > tbody > tr > td {
        background-color: ${EMAIL_CARD_BG} !important;
      }
      .email-force-light-header {
        background-color: ${EMAIL_CARD_BG} !important;
      }
      .email-force-light-body {
        background-color: ${EMAIL_CARD_BG} !important;
        color: ${EMAIL_BODY} !important;
      }
      .email-force-light-footer {
        background-color: ${EMAIL_FOOTER_BG} !important;
      }
      .email-force-light-details {
        background-color: ${EMAIL_DETAILS_BG} !important;
      }
      .email-force-light-heading,
      .email-force-light h1,
      .email-force-light strong {
        color: ${EMAIL_HEADING} !important;
      }
      .email-force-light-muted {
        color: ${EMAIL_LABEL} !important;
      }
      .email-force-light img {
        opacity: 1 !important;
        filter: none !important;
      }
    }
  </style>`;
}

export function buildEmailForceLightBodyAttrs(extraStyle = ''): string {
  const extra = extraStyle.trim();
  const suffix = extra ? (extra.endsWith(';') ? extra : `${extra};`) : '';
  return `class="email-force-light" style="margin:0;padding:0;background-color:${EMAIL_PAGE_BG};color-scheme:light only;${suffix}"`;
}
