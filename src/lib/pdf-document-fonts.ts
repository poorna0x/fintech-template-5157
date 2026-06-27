/** Shared Poppins setup for Puppeteer PDF HTML (prefer <link> over @import). */

export const POPPINS_FONT_FAMILY =
  "'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function renderPoppinsFontHeadLinks(): string {
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=block" rel="stylesheet" />
  `.trim();
}
