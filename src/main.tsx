import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register VitePWA Service Worker in production or when HMR is active
if (import.meta.env.PROD || import.meta.hot) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent('polytechnic-sw-update', {
          detail: { applyUpdate: () => updateSW(true) },
        })
      );
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('polytechnic-sw-offline-ready'));
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
