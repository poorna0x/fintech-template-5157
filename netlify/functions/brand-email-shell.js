/**
 * Server-side port of the customer email shell used across the CRM
 * (see src/lib/email-force-light-html.ts + src/lib/booking-confirmation-email.ts):
 * logo header, centered card, adaptive light/dark styles, contact footer.
 */

const PAGE_BG = '#f3f3f4';
const CARD_BG = '#ffffff';
const FOOTER_BG = '#fafafa';
const DETAILS_BG = '#fafafa';
const HEADING = '#0a0a0a';
const BODY = '#525252';
const LABEL = '#737373';
const BORDER = '#e5e5e5';

const DARK_PAGE_BG = '#1c1c1e';
const DARK_CARD_BG = '#2c2c2e';
const DARK_DETAILS_BG = '#3a3a3c';
const DARK_HEADING = '#f5f5f5';
const DARK_BODY = '#a1a1aa';
const DARK_LABEL = '#8e8e93';
const DARK_BORDER = '#3a3a3c';

const EMAIL_FONT =
  "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BRAND_FONT =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/** Logo webp files are hosted on hydrogenro.com — mail clients cannot load CRM origins. */
const LOGO_ASSET_ORIGIN = 'https://hydrogenro.com';

const BRAND_EMAIL_CONTACT = {
  hydrogenro: {
    label: 'Hydrogen RO',
    origin: 'https://hydrogenro.com',
    phoneDisplay: '9886944288 / 8884944288',
    phoneTel: '+919886944288',
    whatsapp: '918884944288',
    email: 'mail@hydrogenro.com',
    website: 'hydrogenro.com',
  },
  elevenro: {
    label: 'Eleven RO',
    origin: 'https://elevenro.com',
    phoneDisplay: '9880693311 / 8792467611',
    phoneTel: '+919880693311',
    whatsapp: '919880693311',
    email: 'mail@elevenro.com',
    website: 'elevenro.com',
  },
};

function brandKey(brand) {
  return brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

function brandEmailContact(brand) {
  return BRAND_EMAIL_CONTACT[brandKey(brand)];
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Stop mail clients from auto-linking footer phone/email/website text. */
function preventAutoLinkText(text) {
  return escapeHtml(text)
    .replace(/@/g, '&#8203;@')
    .replace(/\./g, '&#8203;.')
    .replace(/\//g, ' &#8203;/&#8203; ');
}

const SHELL = {
  outerCellPadding: 'padding:24px 16px;',
  cardTableBase: 'max-width:560px;width:100%;border-radius:14px;overflow:hidden;',
  cardBorder: `border:1px solid ${BORDER};`,
  cardShadow: 'box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06);',
  headerPadding: 'padding:28px 28px 22px',
  heroBodyPadding: 'padding:28px 28px 8px',
  sectionPadding: (top, bottom) => `padding:${top} 28px ${bottom}`,
  footerPadding: 'padding:18px 24px 22px',
  classes: {
    outer: 'email-shell-outer',
    card: 'email-shell-card',
    header: 'email-shell-header',
    hero: 'email-shell-hero',
    footer: 'email-shell-footer',
    section: 'email-shell-section',
  },
};

function lightSurfaceCss() {
  return `
  html, body {
    background-color: ${PAGE_BG} !important;
    color: ${BODY} !important;
  }
  .email-force-light-page,
  .email-force-light-page > tbody > tr > td { background-color: ${PAGE_BG} !important; }
  .email-force-light-card,
  .email-force-light-card > tbody > tr > td,
  .email-force-light-header,
  .email-force-light-body,
  .email-surface-body {
    background-color: ${CARD_BG} !important;
    border-color: ${BORDER} !important;
  }
  .email-force-light-footer,
  .email-surface-footer {
    background-color: ${FOOTER_BG} !important;
    border-color: ${BORDER} !important;
  }
  .email-force-light-details,
  .email-info-box {
    background-color: ${DETAILS_BG} !important;
    border-color: ${BORDER} !important;
  }
  .email-force-light-heading,
  h1.email-force-light-heading,
  .email-detail-value,
  .email-details-title,
  .email-text-strong,
  .email-body-text strong,
  .email-force-light-card strong,
  .email-badge strong { color: ${HEADING} !important; }
  p.email-force-light-muted { color: ${LABEL} !important; }
  p.email-body-text,
  p.email-footer-muted,
  .email-force-light-footer p.email-footer-muted { color: ${BODY} !important; }
  .email-detail-label { color: ${LABEL} !important; }
  .email-force-light-footer p.email-details-title,
  .email-info-box p.email-details-title { color: ${HEADING} !important; }
  .email-badge {
    background-color: #f4f4f5 !important;
    border-color: ${BORDER} !important;
    color: ${HEADING} !important;
  }
  .email-badge .email-badge-success { color: #16a34a !important; }
  .email-footer-muted,
  .email-footer-muted span { color: ${LABEL} !important; }
  .email-logo-icon-clip {
    border-radius: 8px !important;
    -webkit-border-radius: 8px !important;
    overflow: hidden !important;
  }
  .email-logo-block-light { display: table !important; border-collapse: collapse !important; }
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
  .email-brand-name { color: ${HEADING} !important; }
  .email-section-label { color: ${LABEL} !important; }
  .email-cta-btn { background-color: ${HEADING} !important; }
  .email-cta-btn .email-cta-label { color: #ffffff !important; }
  .email-action-btn-whatsapp {
    background-color: #f0fdf4 !important;
    border-color: #86efac !important;
  }
  .email-action-btn-whatsapp .email-action-btn-label { color: #15803d !important; }
  .email-action-btn-call {
    background-color: #fafafa !important;
    border-color: ${BORDER} !important;
  }
  .email-action-btn-call .email-action-btn-label { color: ${HEADING} !important; }
  .email-action-btn-icon { filter: none !important; opacity: 1 !important; }
  .email-success-icon {
    background-color: #dcfce7 !important;
    color: #16a34a !important;
  }`;
}

function darkSurfaceCss() {
  return `
  html, body {
    background-color: ${DARK_PAGE_BG} !important;
    color: ${DARK_BODY} !important;
  }
  .email-force-light-page,
  .email-force-light-page > tbody > tr > td { background-color: ${DARK_PAGE_BG} !important; }
  .email-force-light-card,
  .email-force-light-card > tbody > tr > td,
  .email-force-light-header,
  .email-force-light-body,
  .email-surface-body,
  .email-force-light-footer,
  .email-surface-footer {
    background-color: ${DARK_CARD_BG} !important;
    border-color: ${DARK_BORDER} !important;
  }
  .email-force-light-details,
  .email-info-box {
    background-color: ${DARK_DETAILS_BG} !important;
    border-color: #48484a !important;
  }
  .email-force-light-heading,
  h1.email-force-light-heading,
  .email-detail-value,
  .email-details-title,
  .email-text-strong,
  .email-body-text strong,
  .email-force-light-card strong,
  .email-badge strong { color: ${DARK_HEADING} !important; }
  p.email-force-light-muted { color: ${DARK_LABEL} !important; }
  p.email-body-text,
  p.email-footer-muted,
  .email-force-light-footer p.email-footer-muted { color: ${DARK_BODY} !important; }
  .email-detail-label { color: ${DARK_LABEL} !important; }
  .email-force-light-footer p.email-details-title,
  .email-info-box p.email-details-title { color: #d4d4d8 !important; }
  .email-badge {
    background-color: #3a3a3c !important;
    border-color: #52525b !important;
    color: ${DARK_HEADING} !important;
  }
  .email-badge .email-badge-success { color: #4ade80 !important; }
  .email-footer-muted,
  .email-footer-muted span { color: ${DARK_LABEL} !important; }
  .email-logo-block-light {
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
  .email-logo-block-dark {
    display: table !important;
    max-height: none !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    opacity: 1 !important;
    visibility: visible !important;
    border-collapse: collapse !important;
  }
  .email-logo-light { display: none !important; }
  .email-logo-dark {
    display: block !important;
    max-height: none !important;
    border-radius: 8px !important;
    -webkit-border-radius: 8px !important;
  }
  .email-brand-name { color: ${DARK_HEADING} !important; }
  .email-section-label { color: ${DARK_LABEL} !important; }
  .email-cta-btn { background-color: #f5f5f5 !important; }
  .email-cta-btn .email-cta-label { color: #0a0a0a !important; }
  .email-action-btn {
    background-color: #48484a !important;
    border: 1px solid #636366 !important;
    border-radius: 10px !important;
  }
  .email-action-btn-whatsapp { border-color: #34d399 !important; }
  .email-action-btn .email-action-btn-label { color: #ffffff !important; }
  .email-action-btn .email-action-btn-icon {
    filter: brightness(0) invert(1) !important;
    opacity: 1 !important;
  }
  .email-success-icon {
    background-color: #1a3d2e !important;
    color: #4ade80 !important;
  }`;
}

function responsiveCss() {
  const c = SHELL.classes;
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
      .${c.footer} { padding: 18px 16px 22px !important; }
      .${c.section} {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
    }`;
}

function headStyles() {
  return `
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style type="text/css">
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    html, body { color-scheme: light dark; background-color: ${PAGE_BG}; }
    ${lightSurfaceCss()}
    ${responsiveCss()}
    @media (prefers-color-scheme: dark) {
      ${darkSurfaceCss()}
    }
  </style>`;
}

function logoHeaderBlock(brandName) {
  const icon = 32;
  const imgStyle = `display:block;width:${icon}px;height:${icon}px;max-width:${icon}px;max-height:${icon}px;border:0;border-radius:8px;-webkit-border-radius:8px;object-fit:cover;object-position:center;`;
  const clipStyle = `width:${icon}px;height:${icon}px;padding:0;line-height:0;font-size:0;border-radius:8px;-webkit-border-radius:8px;overflow:hidden;`;
  const darkHidden =
    'display:none;max-height:0;max-width:0;width:0;height:0;overflow:hidden;opacity:0;visibility:hidden;mso-hide:all;border-collapse:collapse;';
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td valign="middle" style="padding-right:8px;line-height:0;font-size:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-logo-block-light" style="border-collapse:collapse;">
                      <tr>
                        <td class="email-logo-icon-clip" style="${clipStyle}">
                          <img class="email-logo-light" src="${LOGO_ASSET_ORIGIN}/logo-dark.webp" alt="" width="${icon}" height="${icon}" style="${imgStyle}" />
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-logo-block-dark" style="${darkHidden}">
                      <tr>
                        <td class="email-logo-icon-clip" style="${clipStyle}">
                          <img class="email-logo-dark" src="${LOGO_ASSET_ORIGIN}/logo-white.webp" alt="" width="${icon}" height="${icon}" style="${imgStyle}" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" class="email-brand-name" style="font-family:${BRAND_FONT};font-size:20px;font-weight:700;line-height:1;letter-spacing:-0.01em;white-space:nowrap;color:${HEADING};">
                    ${escapeHtml(brandName)}
                  </td>
                </tr>
              </table>`;
}

function successIconBlock() {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
                <tr>
                  <td align="center" valign="middle" width="48" height="48" class="email-success-icon" style="width:48px;height:48px;background-color:#dcfce7;border-radius:999px;font-family:${EMAIL_FONT};font-size:24px;font-weight:700;color:#16a34a;line-height:48px;text-align:center;">
                    &#10003;
                  </td>
                </tr>
              </table>`;
}

function ctaButtonBlock(href, label) {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" class="email-cta-btn" style="background-color:${HEADING};border-radius:10px;">
                    <a href="${escapeHtml(href)}" class="email-cta-label" style="display:block;padding:14px 28px;font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(label)}</a>
                  </td>
                </tr>
              </table>`;
}

function actionButton(href, iconUrl, label, borderColor, textColor, bgColor, variant) {
  const variantClass =
    variant === 'whatsapp' ? 'email-action-btn-whatsapp' : 'email-action-btn-call';
  return `
    <a href="${escapeHtml(href)}" class="email-action-btn ${variantClass}" style="display:block;background-color:${bgColor};color:${textColor};text-decoration:none;border-radius:10px;padding:12px 10px;border:1px solid ${borderColor};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:7px;line-height:0;">
            <img src="${iconUrl}" width="18" height="18" alt="" class="email-action-btn-icon" style="display:block;width:18px;height:18px;border:0;" />
          </td>
          <td valign="middle" class="email-action-btn-label" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${textColor};letter-spacing:-0.01em;">
            ${escapeHtml(label)}
          </td>
        </tr>
      </table>
    </a>`;
}

function helpButtonsRow(contact, whatsappText) {
  const waHref = `https://wa.me/${contact.whatsapp}${whatsappText ? `?text=${encodeURIComponent(whatsappText)}` : ''}`;
  const whatsapp = actionButton(
    waHref,
    `${contact.origin}/whatsapp.png`,
    'WhatsApp',
    '#86efac',
    '#15803d',
    '#f0fdf4',
    'whatsapp'
  );
  const call = actionButton(
    `tel:${contact.phoneTel}`,
    `${contact.origin}/telephone-call.png`,
    'Call us',
    BORDER,
    HEADING,
    '#fafafa',
    'call'
  );
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" style="width:50%;padding-right:6px;vertical-align:top;">${whatsapp}</td>
                  <td width="50%" style="width:50%;padding-left:6px;vertical-align:top;">${call}</td>
                </tr>
              </table>`;
}

/**
 * @param {object} options
 * @param {string} options.brand document brand key
 * @param {string} options.previewText inbox preview line (hidden in the body)
 * @param {string} options.eyebrow small uppercase label above the heading
 * @param {string} options.heading main heading
 * @param {string} options.introHtml pre-escaped paragraphs
 * @param {{href:string,label:string}} [options.cta] primary button
 * @param {string} [options.badgeHtml] pill under the intro (pre-escaped)
 * @param {string} [options.infoBoxHtml] bordered panel (pre-escaped)
 * @param {boolean} [options.showSuccessIcon]
 * @param {string} [options.noteHtml] small print above the footer (pre-escaped)
 * @param {string} [options.whatsappText] prefilled WhatsApp message
 */
function buildBrandEmailHtml(options) {
  const contact = brandEmailContact(options.brand);
  const brandName = contact.label;
  const section = SHELL.classes.section;

  const badgeRow = options.badgeHtml
    ? `
          <tr>
            <td align="center" class="email-surface-body ${section}" style="${SHELL.sectionPadding('8px', '4px')};text-align:center;background-color:${CARD_BG};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td class="email-badge" style="border:1px solid ${BORDER};border-radius:999px;padding:9px 20px;font-family:${EMAIL_FONT};font-size:13px;font-weight:500;text-align:center;">
                    ${options.badgeHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  const ctaRow = options.cta
    ? `
          <tr>
            <td align="center" class="email-surface-body ${section}" style="${SHELL.sectionPadding('20px', '4px')};text-align:center;background-color:${CARD_BG};">
              ${ctaButtonBlock(options.cta.href, options.cta.label)}
            </td>
          </tr>`
    : '';

  const infoRow = options.infoBoxHtml
    ? `
          <tr>
            <td class="email-surface-body ${section}" style="${SHELL.sectionPadding('20px', '4px')};background-color:${CARD_BG};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-info-box" style="background-color:${DETAILS_BG};border:1px solid ${BORDER};border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">${options.infoBoxHtml}</td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  const noteRow = options.noteHtml
    ? `
          <tr>
            <td class="email-surface-body ${section}" style="${SHELL.sectionPadding('16px', '4px')};background-color:${CARD_BG};">
              <p class="email-footer-muted" style="margin:0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;text-align:center;color:${LABEL};">${options.noteHtml}</p>
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light dark;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
  <title>${escapeHtml(brandName)} — ${escapeHtml(options.heading)}</title>
  ${headStyles()}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="email-force-light" style="margin:0;padding:0;background-color:${PAGE_BG};color-scheme:light dark;font-family:${EMAIL_FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(options.previewText || '')}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-page" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};font-family:${EMAIL_FONT};">
    <tr>
      <td align="center" class="${SHELL.classes.outer}" style="${SHELL.outerCellPadding}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-card ${SHELL.classes.card}" bgcolor="${CARD_BG}" style="${SHELL.cardTableBase}${SHELL.cardBorder}${SHELL.cardShadow}background-color:${CARD_BG};font-family:${EMAIL_FONT};">

          <tr>
            <td align="center" class="email-force-light-header ${SHELL.classes.header}" bgcolor="${CARD_BG}" style="${SHELL.headerPadding};background-color:${CARD_BG};border-bottom:1px solid ${BORDER};text-align:center;">
              ${logoHeaderBlock(brandName)}
            </td>
          </tr>

          <tr>
            <td align="center" class="email-force-light-body email-surface-body ${SHELL.classes.hero}" bgcolor="${CARD_BG}" style="${SHELL.heroBodyPadding};text-align:center;background-color:${CARD_BG};">
              ${options.showSuccessIcon ? successIconBlock() : ''}
              ${options.eyebrow ? `<p class="email-force-light-muted" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.4px;text-align:center;color:${LABEL};">${escapeHtml(options.eyebrow)}</p>` : ''}
              <h1 class="email-force-light-heading" style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.2;font-weight:700;text-align:center;letter-spacing:-0.03em;color:${HEADING};">${escapeHtml(options.heading)}</h1>
              ${options.introHtml || ''}
            </td>
          </tr>
${badgeRow}${ctaRow}${infoRow}${noteRow}
          <tr>
            <td class="email-surface-body ${section}" style="${SHELL.sectionPadding('22px', '8px')};background-color:${CARD_BG};">
              <p class="email-section-label" style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;text-align:center;color:${LABEL};">Need help?</p>
            </td>
          </tr>

          <tr>
            <td class="email-surface-body ${section}" style="${SHELL.sectionPadding('0', '26px')};background-color:${CARD_BG};">
              ${helpButtonsRow(contact, options.whatsappText)}
            </td>
          </tr>

          <tr>
            <td align="center" class="email-force-light-footer email-surface-footer ${SHELL.classes.footer}" bgcolor="${FOOTER_BG}" style="${SHELL.footerPadding};background-color:${FOOTER_BG};border-top:1px solid ${BORDER};text-align:center;">
              <p class="email-details-title" style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;text-align:center;color:${HEADING};">${escapeHtml(brandName)}</p>
              <p class="email-footer-muted" style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;text-align:center;color:${LABEL};">
                <span style="text-decoration:none !important;">${preventAutoLinkText(contact.phoneDisplay)} &middot; ${preventAutoLinkText(contact.email)}</span>
              </p>
              <p class="email-footer-muted" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;text-align:center;color:${LABEL};">
                <span style="text-decoration:none !important;">${preventAutoLinkText(contact.website)}</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Body paragraph in the shared customer-email style. */
function emailParagraph(html, extraStyle = '') {
  return `<p class="email-body-text" style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;text-align:center;font-weight:400;color:${BODY};${extraStyle}">${html}</p>`;
}

module.exports = {
  BRAND_EMAIL_CONTACT,
  EMAIL_FONT,
  EMAIL_SHELL_COLORS: { HEADING, BODY, LABEL, BORDER, CARD_BG, DETAILS_BG },
  brandEmailContact,
  buildBrandEmailHtml,
  emailParagraph,
  escapeHtml,
};
