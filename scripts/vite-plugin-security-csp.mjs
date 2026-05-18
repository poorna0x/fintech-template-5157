import { DEVELOPMENT_CSP } from './csp-config.mjs';

/** Dev: inject permissive CSP meta. Production CSP is set via dist/_headers after build. */
export function securityCspPlugin(mode) {
  return {
    name: 'security-csp',
    transformIndexHtml(html) {
      if (mode !== 'development') {
        return html;
      }
      const escaped = DEVELOPMENT_CSP.replace(/"/g, '&quot;');
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${escaped}" />\n`;
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n${meta}`,
      );
    },
  };
}
