import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { getServiceWorkerUrl } from './runtimePaths';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(getServiceWorkerUrl(import.meta.env.BASE_URL)).catch(() => {
      // Ignore registration failures in local/dev contexts.
    });
  });
}
