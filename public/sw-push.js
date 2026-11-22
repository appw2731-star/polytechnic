/* Polytechnic Hub — Service Worker Push & Click Handler
 * Imported by Workbox sw.js (via vite-plugin-pwa importScripts) and also usable
 * standalone when registering Web Push / Firebase Cloud Messaging background handling.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {
      notification: {
        title: 'Polytechnic Hub',
        body: event.data.text(),
      },
    };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || 'Polytechnic Hub';
  const body = notif.body || data.body || '';
  const category = String(data.category || 'GENERAL').toUpperCase();
  const targetView = String(data.targetView || data.target_view || 'notifications');
  const notificationId = String(data.notificationId || data.notification_id || '');
  const actionUrl = String(data.actionUrl || data.action_url || (payload.fcmOptions && payload.fcmOptions.link) || '');
  const image = notif.image || data.imageUrl || data.image_url || undefined;
  const soundMode = String(data.soundMode || data.sound_mode || 'custom');

  const isEmergency = category === 'EMERGENCY';
  const badgeIcon = '/pwa-192x192.png';

  const options = {
    body,
    icon: notif.icon || badgeIcon,
    badge: badgeIcon,
    image: image || undefined,
    tag: notificationId ? `ph-notif-${notificationId}` : `ph-cat-${category}`,
    renotify: true,
    requireInteraction: isEmergency,
    silent: soundMode === 'silent',
    vibrate: isEmergency ? [250, 100, 250, 100, 350] : [120, 60, 120],
    data: {
      notificationId,
      category,
      targetView,
      actionUrl,
      title,
      body,
      image: image || '',
      soundMode,
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
      },
    ],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Notify any open app windows so inbox & foreground sound/toast update immediately
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({
          type: 'POLYTECHNIC_PUSH_RECEIVED',
          payload: options.data,
        });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetView = String(data.targetView || 'notifications');
  const notificationId = String(data.notificationId || '');
  const actionUrl = String(data.actionUrl || '');

  const relativePath =
    actionUrl && actionUrl.startsWith('/')
      ? actionUrl
      : `/?view=${encodeURIComponent(targetView)}${notificationId ? `&nid=${encodeURIComponent(notificationId)}` : ''}`;

  const destinationUrl =
    actionUrl && /^https?:\/\//i.test(actionUrl)
      ? actionUrl
      : new URL(relativePath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'POLYTECHNIC_NOTIFICATION_CLICK',
            targetView,
            notificationId,
            actionUrl,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(destinationUrl);
      }
    })()
  );
});
