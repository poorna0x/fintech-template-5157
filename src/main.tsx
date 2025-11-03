import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'altcha' // Import ALTCHA web component
import 'altcha/altcha.css' // Import ALTCHA styles

createRoot(document.getElementById("root")!).render(<App />);
