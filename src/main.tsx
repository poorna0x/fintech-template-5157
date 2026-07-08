import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initLayoutStabilityOnResume } from './lib/layoutStability'

function removeFoucGuards() {
  document.getElementById('async-css-fouc-guards')?.remove();
}

// App CSS is a blocking stylesheet in production builds (see vite-plugin-async-css.mjs).
removeFoucGuards();

const disposeLayoutStability = initLayoutStabilityOnResume()

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeLayoutStability())
}
