import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

document.getElementById('async-css-fouc-guards')?.remove();

createRoot(document.getElementById("root")!).render(<App />);
