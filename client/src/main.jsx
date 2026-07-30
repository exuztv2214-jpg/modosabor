import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.jsx';
import './index.css';

const SW_VERSION = '2026-07-21-1';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isRiderPath = window.location.pathname.startsWith('/rider');
    const serviceWorkerUrl = isRiderPath ? '/sw-rider.js' : '/sw-admin.js';
    const scope = isRiderPath ? '/rider' : '/admin';
    const serviceWorkerRegistrationUrl = `${serviceWorkerUrl}?v=${encodeURIComponent(SW_VERSION)}`;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => {
            const scriptUrl =
              registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              '';
            const isLegacyRootWorker = scriptUrl.endsWith('/sw.js');
            const isWrongScopedWorker = isRiderPath
              ? scriptUrl.includes('/sw-admin.js')
              : scriptUrl.includes('/sw-rider.js');
            const isOutdatedCurrentWorker =
              (scriptUrl.includes('/sw-admin.js') || scriptUrl.includes('/sw-rider.js')) &&
              !scriptUrl.includes(`v=${SW_VERSION}`);
            if (isLegacyRootWorker || isWrongScopedWorker || isOutdatedCurrentWorker) {
              return registration.unregister();
            }
            return null;
          })
        )
      )
      .catch(() => null)
      .finally(() => {
        navigator.serviceWorker
          .register(serviceWorkerRegistrationUrl, { scope })
          .then((registration) => registration.update().catch(() => null))
          .catch(() => {});
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
