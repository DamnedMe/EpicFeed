'use client';

import { useEffect } from 'react';

/**
 * Registra il service worker (`public/sw.js`) solo nella build di produzione:
 * in sviluppo una cache dei file renderebbe invisibili le modifiche.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Senza service worker l'app funziona lo stesso, solo non si apre offline.
    });
  }, []);
  return null;
}
