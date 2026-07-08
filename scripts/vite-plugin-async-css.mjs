/**
 * Production CSS loading — keep Vite's default blocking <link rel="stylesheet">.
 *
 * Async preload conversion caused intermittent FOUC (HTML visible before Tailwind).
 * Critical inline CSS in index.html is not enough for the full marketing layout.
 */
export function asyncCssPlugin(_mode) {
  return {
    name: 'async-css',
    apply: 'build',
  };
}
