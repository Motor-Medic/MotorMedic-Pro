import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Buffer } from 'buffer';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/Toast.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Vite does not polyfill Node builtins — expose Buffer for browser deps
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
