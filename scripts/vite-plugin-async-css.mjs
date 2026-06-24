/**
 * Make Vite-injected app stylesheets non-render-blocking in production builds.
 * Critical layout rules live inline in index.html; full Tailwind loads async.
 */
export function asyncCssPlugin(mode) {
  return {
    name: 'async-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (mode !== 'production') {
          return html;
        }

        const stylesheetPattern =
          /<link\s+rel="stylesheet"\s+crossorigin\s+href="(\/assets\/[^"]+\.css)">\s*/g;

        return html.replace(stylesheetPattern, (_match, href) => {
          return (
            `<link rel="preload" href="${href}" as="style" crossorigin data-async-css="true" ` +
            `onload="this.onload=null;this.rel='stylesheet';this.removeAttribute('as');this.removeAttribute('data-async-css')">\n` +
            `    <noscript><link rel="stylesheet" crossorigin href="${href}"></noscript>\n`
          );
        });
      },
    },
  };
}
