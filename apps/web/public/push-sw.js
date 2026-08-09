
// BuildBase Push Notification Service Worker
// Place this file in your app's public directory (e.g. public/push-sw.js)

self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    // i18n exception: service workers run outside the SDK's translation
    // provider, so this last-resort fallback stays English. The server should
    // always send a localized payload.title.
    const title = payload.title || 'Notification';
    const options = {
      body: payload.body || '',
      icon: payload.icon || undefined,
      badge: payload.icon || undefined,
      data: { url: payload.url, ...(payload.data || {}) },
      tag: 'buildbase-push-' + Date.now(),
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.error('[PushSW] Failed to show notification:', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url;
  if (url) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});
