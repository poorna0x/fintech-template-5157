/** Shared adaptive light/dark styles — single source for sent mail + CRM preview. */

export const EMAIL_PAGE_BG = '#f3f3f4';
export const EMAIL_CARD_BG = '#ffffff';
export const EMAIL_FOOTER_BG = '#fafafa';
export const EMAIL_DETAILS_BG = '#fafafa';
export const EMAIL_HEADING = '#0a0a0a';
export const EMAIL_BODY = '#525252';
export const EMAIL_LABEL = '#737373';

export const EMAIL_DARK_PAGE_BG = '#1c1c1e';
export const EMAIL_DARK_CARD_BG = '#2c2c2e';
export const EMAIL_DARK_DETAILS_BG = '#3a3a3c';
export const EMAIL_DARK_HEADING = '#f5f5f5';
export const EMAIL_DARK_BODY = '#a1a1aa';
export const EMAIL_DARK_LABEL = '#8e8e93';
export const EMAIL_DARK_BORDER = '#3a3a3c';

/** Customer email shell — desktop-centered card; full-bleed on mobile via @media in head CSS. */
export const EMAIL_LAYOUT = {
  outerCellPadding: 'padding:24px 16px;',
  cardTableBase:
    'max-width:560px;width:100%;border-radius:14px;overflow:hidden;',
  cardBorder: (borderColor: string) => `border:1px solid ${borderColor};`,
  cardShadow: 'box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06);',
  headerPadding: 'padding:28px 28px 22px',
  heroBodyPadding: 'padding:28px 28px 8px',
  mainBodyPadding: 'padding:8px 28px 24px',
  sectionPadding: (top: string, bottom: string) => `padding:${top} 28px ${bottom}`,
  footerPadding: 'padding:18px 24px 22px',
  classes: {
    outer: 'email-shell-outer',
    card: 'email-shell-card',
    header: 'email-shell-header',
    hero: 'email-shell-hero',
    main: 'email-shell-main',
    footer: 'email-shell-footer',
    section: 'email-shell-section',
  },
} as const;

export function buildEmailResponsiveShellCss(): string {
  const c = EMAIL_LAYOUT.classes;
  return `
    @media screen and (max-width: 599px) {
      .${c.outer} { padding: 0 !important; }
      .${c.card} {
        max-width: 100% !important;
        width: 100% !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      .${c.header} { padding: 24px 16px 20px !important; }
      .${c.hero} { padding: 24px 16px 8px !important; }
      .${c.main} { padding: 8px 16px 24px !important; }
      .${c.footer} { padding: 18px 16px 22px !important; }
      .${c.section} {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
    }`;
}

function sel(prefix: string): string {
  return prefix ? `${prefix} ` : '';
}

/** Light-theme logo, buttons, panels (preview lock — beats @media on dark OS). */
export function buildEmailLightComponentCss(selectorPrefix = ''): string {
  const s = sel(selectorPrefix);
  return `
  ${s}.email-logo-icon-clip {
    border-radius: 8px !important;
    -webkit-border-radius: 8px !important;
    overflow: hidden !important;
  }
  ${s}.email-logo-block-light {
    display: table !important;
    border-collapse: collapse !important;
  }
  ${s}.email-logo-block-dark {
    display: none !important;
    max-height: 0 !important;
    max-width: 0 !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    visibility: hidden !important;
    mso-hide: all !important;
    border-collapse: collapse !important;
  }
  ${s}.email-logo-light {
    display: block !important;
    max-height: none !important;
    border-radius: 8px !important;
    -webkit-border-radius: 8px !important;
  }
  ${s}.email-logo-dark {
    display: none !important;
    max-height: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    mso-hide: all !important;
  }
  ${s}.email-brand-name { color: ${EMAIL_HEADING} !important; }
  ${s}.email-section-label { color: ${EMAIL_LABEL} !important; }
  ${s}.email-action-btn-whatsapp {
    background-color: #f0fdf4 !important;
    border-color: #86efac !important;
  }
  ${s}.email-action-btn-whatsapp .email-action-btn-label { color: #15803d !important; }
  ${s}.email-action-btn-call {
    background-color: #fafafa !important;
    border-color: #e5e5e5 !important;
  }
  ${s}.email-action-btn-call .email-action-btn-label { color: ${EMAIL_HEADING} !important; }
  ${s}.email-action-btn-icon {
    filter: none !important;
    opacity: 1 !important;
  }
  ${s}.email-success-icon {
    background-color: #dcfce7 !important;
    color: #16a34a !important;
  }
  ${s}.email-success-panel {
    background-color: #dcfce7 !important;
    border-color: #bbf7d0 !important;
  }
  ${s}.email-success-panel p { color: #15803d !important; }
  ${s}.email-attachment-notice {
    background-color: #eff6ff !important;
    border-color: #bfdbfe !important;
  }
  ${s}.email-attachment-notice p,
  ${s}.email-attachment-notice li { color: #1d4ed8 !important; }`;
}

export function buildEmailLightSurfaceCss(selectorPrefix = ''): string {
  const s = sel(selectorPrefix);
  return `
  ${s}html,
  ${s}body {
    background-color: ${EMAIL_PAGE_BG} !important;
    color: ${EMAIL_BODY} !important;
  }
  ${s}.email-force-light-page,
  ${s}.email-force-light-page > tbody > tr > td {
    background-color: ${EMAIL_PAGE_BG} !important;
  }
  ${s}.email-force-light-card,
  ${s}.email-force-light-card > tbody > tr > td,
  ${s}.email-force-light-header,
  ${s}.email-force-light-body,
  ${s}.email-surface-body {
    background-color: ${EMAIL_CARD_BG} !important;
    border-color: #e5e5e5 !important;
  }
  ${s}.email-force-light-footer,
  ${s}.email-surface-footer {
    background-color: ${EMAIL_FOOTER_BG} !important;
    border-color: #e5e5e5 !important;
  }
  ${s}.email-force-light-details,
  ${s}.email-info-box {
    background-color: ${EMAIL_DETAILS_BG} !important;
    border-color: #e5e5e5 !important;
  }
  ${s}.email-force-light-heading,
  ${s}h1.email-force-light-heading,
  ${s}.email-detail-value,
  ${s}.email-details-title,
  ${s}.email-text-strong,
  ${s}.email-body-text strong,
  ${s}.email-force-light-card strong,
  ${s}.email-badge strong {
    color: ${EMAIL_HEADING} !important;
  }
  ${s}p.email-force-light-muted { color: ${EMAIL_LABEL} !important; }
  ${s}p.email-body-text,
  ${s}p.email-step-text,
  ${s}p.email-footer-muted,
  ${s}.email-force-light-footer p.email-footer-muted {
    color: ${EMAIL_BODY} !important;
  }
  ${s}.email-detail-label { color: ${EMAIL_LABEL} !important; }
  ${s}.email-force-light-footer p.email-details-title,
  ${s}.email-info-box p.email-details-title {
    color: ${EMAIL_HEADING} !important;
  }
  ${s}.email-badge {
    background-color: #f4f4f5 !important;
    border-color: #e5e5e5 !important;
    color: ${EMAIL_HEADING} !important;
  }
  ${s}.email-badge strong { color: ${EMAIL_HEADING} !important; }
  ${s}.email-badge .email-badge-success { color: #16a34a !important; }
  ${s}.email-footer-muted,
  ${s}.email-footer-muted span { color: ${EMAIL_LABEL} !important; }
  ${s}.email-step-num {
    background-color: ${EMAIL_HEADING} !important;
    color: #ffffff !important;
  }
  ${buildEmailLightComponentCss(selectorPrefix)}`;
}

/** Dark-theme logo, buttons, panels. */
export function buildEmailDarkComponentCss(selectorPrefix = ''): string {
  const s = sel(selectorPrefix);
  return `
  ${s}.email-logo-block-light {
    display: none !important;
    max-height: 0 !important;
    max-width: 0 !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    visibility: hidden !important;
    mso-hide: all !important;
  }
  ${s}.email-logo-block-dark {
    display: table !important;
    max-height: none !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    opacity: 1 !important;
    visibility: visible !important;
    border-collapse: collapse !important;
  }
  ${s}.email-logo-light { display: none !important; }
  ${s}.email-logo-dark {
    display: block !important;
    max-height: none !important;
    overflow: hidden !important;
    border-radius: 8px !important;
    -webkit-border-radius: 8px !important;
  }
  ${s}.email-brand-name { color: ${EMAIL_DARK_HEADING} !important; }
  ${s}.email-section-label { color: ${EMAIL_DARK_LABEL} !important; }
  ${s}.email-action-btn {
    background-color: #48484a !important;
    border: 1px solid #636366 !important;
    border-radius: 10px !important;
  }
  ${s}.email-action-btn-whatsapp { border-color: #34d399 !important; }
  ${s}.email-action-btn .email-action-btn-label { color: #ffffff !important; }
  ${s}.email-action-btn .email-action-btn-icon {
    filter: brightness(0) invert(1) !important;
    opacity: 1 !important;
  }
  ${s}.email-success-icon {
    background-color: #1a3d2e !important;
    color: #4ade80 !important;
  }
  ${s}.email-success-panel {
    background-color: #1a3328 !important;
    border-color: #2d6a4f !important;
  }
  ${s}.email-success-panel p { color: #86efac !important; }
  ${s}.email-attachment-notice {
    background-color: #1e293b !important;
    border-color: #334155 !important;
  }
  ${s}.email-attachment-notice p,
  ${s}.email-attachment-notice li { color: #93c5fd !important; }`;
}

export function buildEmailDarkSurfaceCss(selectorPrefix = ''): string {
  const s = sel(selectorPrefix);
  return `
  ${s}html,
  ${s}body {
    background-color: ${EMAIL_DARK_PAGE_BG} !important;
    color: ${EMAIL_DARK_BODY} !important;
  }
  ${s}.email-force-light-page,
  ${s}.email-force-light-page > tbody > tr > td {
    background-color: ${EMAIL_DARK_PAGE_BG} !important;
  }
  ${s}.email-force-light-card,
  ${s}.email-force-light-card > tbody > tr > td,
  ${s}.email-force-light-header,
  ${s}.email-force-light-body,
  ${s}.email-surface-body {
    background-color: ${EMAIL_DARK_CARD_BG} !important;
    border-color: ${EMAIL_DARK_BORDER} !important;
  }
  ${s}.email-force-light-footer,
  ${s}.email-surface-footer {
    background-color: ${EMAIL_DARK_CARD_BG} !important;
    border-color: ${EMAIL_DARK_BORDER} !important;
  }
  ${s}.email-force-light-details,
  ${s}.email-info-box {
    background-color: ${EMAIL_DARK_DETAILS_BG} !important;
    border-color: #48484a !important;
  }
  ${s}.email-force-light-heading,
  ${s}h1.email-force-light-heading,
  ${s}.email-detail-value,
  ${s}.email-details-title,
  ${s}.email-text-strong,
  ${s}.email-body-text strong,
  ${s}.email-force-light-card strong,
  ${s}.email-badge strong {
    color: ${EMAIL_DARK_HEADING} !important;
  }
  ${s}p.email-force-light-muted { color: ${EMAIL_DARK_LABEL} !important; }
  ${s}p.email-body-text,
  ${s}p.email-step-text,
  ${s}p.email-footer-muted,
  ${s}.email-force-light-footer p.email-footer-muted {
    color: ${EMAIL_DARK_BODY} !important;
  }
  ${s}.email-detail-label { color: ${EMAIL_DARK_LABEL} !important; }
  ${s}.email-force-light-footer p.email-details-title,
  ${s}.email-info-box p.email-details-title {
    color: #d4d4d8 !important;
  }
  ${s}.email-badge {
    background-color: #3a3a3c !important;
    border-color: #52525b !important;
    color: ${EMAIL_DARK_HEADING} !important;
  }
  ${s}.email-badge strong { color: ${EMAIL_DARK_HEADING} !important; }
  ${s}.email-badge .email-badge-success { color: #4ade80 !important; }
  ${s}.email-footer-muted,
  ${s}.email-footer-muted span { color: ${EMAIL_DARK_LABEL} !important; }
  ${s}.email-force-light-details { border-left-color: ${EMAIL_DARK_HEADING} !important; }
  ${s}.email-step-num {
    background-color: ${EMAIL_DARK_HEADING} !important;
    color: ${EMAIL_DARK_CARD_BG} !important;
  }
  ${buildEmailDarkComponentCss(selectorPrefix)}`;
}

/** Meta + CSS for sent mail — @media tracks the recipient's system theme. */
export function buildEmailForceLightHead(): string {
  return `
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    html, body {
      color-scheme: light dark;
      background-color: ${EMAIL_PAGE_BG};
    }
    .email-logo-icon-clip {
      border-radius: 8px !important;
      -webkit-border-radius: 8px !important;
      overflow: hidden !important;
    }
    .email-logo-block-light {
      display: table !important;
      border-collapse: collapse !important;
    }
    .email-logo-block-dark {
      display: none !important;
      max-height: 0 !important;
      max-width: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      visibility: hidden !important;
      mso-hide: all !important;
      border-collapse: collapse !important;
    }
    .email-logo-light {
      display: block !important;
      border-radius: 8px !important;
      -webkit-border-radius: 8px !important;
    }
    .email-logo-dark {
      display: none !important;
      max-height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
      mso-hide: all !important;
    }
    .email-brand-name {
      color: ${EMAIL_HEADING} !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-weight: 700 !important;
      letter-spacing: -0.01em !important;
    }
    ${buildEmailLightSurfaceCss()}
    ${buildEmailResponsiveShellCss()}
    @media (prefers-color-scheme: dark) {
      ${buildEmailDarkSurfaceCss()}
    }
  </style>`;
}

export function buildEmailForceLightBodyAttrs(extraStyle = ''): string {
  const extra = extraStyle.trim();
  const suffix = extra ? (extra.endsWith(';') ? extra : `${extra};`) : '';
  return `class="email-force-light" style="margin:0;padding:0;background-color:${EMAIL_PAGE_BG};color-scheme:light dark;${suffix}"`;
}
