import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initLayoutStabilityOnResume } from './lib/layoutStability'

function removeFoucGuards() {
  document.getElementById('async-css-fouc-guards')?.remove();
}

// Dev: Vite injects CSS synchronously during the import above.
// Prod: keep guards until the async stylesheet is active (head-seo-bootstrap also removes them).
if (import.meta.env.DEV) {
  removeFoucGuards();
} else {
  const appCss = document.querySelector<HTMLLinkElement>(
    'link[rel="stylesheet"][href*="/assets/"], link[data-async-css="true"]',
  );
  if (appCss?.sheet) {
    removeFoucGuards();
  } else if (appCss) {
    appCss.addEventListener('load', removeFoucGuards, { once: true });
  }
}

const disposeLayoutStability = initLayoutStabilityOnResume()

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeLayoutStability())
}
