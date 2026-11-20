import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';
import { ErrorBoundary } from './app/error-boundary';
import './app/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('The application root is missing.');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    window.dispatchEvent(new Event('studypal:offline-unavailable'));
  });
}
