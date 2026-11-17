/* eslint-disable no-undef */
// Service Worker for Sanvad Web Push & Firebase Cloud Messaging (FCM) background notifications

const sanvadActiveClients = new Map();

// Initialize Firebase Cloud Messaging background handler via compat SDK
// (works seamlessly both standalone and when imported via Workbox importScripts)
let fcmInitialized = false;
try {
  importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: 'AIzaSyDjYesZsCI92_VkcuX2gvSoOMcluDOx8sw',
        authDomain: 'gen-lang-client-0772664257.firebaseapp.com',
        projectId: 'gen-lang-client-0772664257',
        storageBucket: 'gen-lang-client-0772664257.firebasestorage.app',
        messagingSenderId: '105789976187',
        appId: '1:105789976187:web:374189817691564368bcde',
      });
    }

    const messaging = firebase.messaging();
    fcmInitialized = true;

    messaging.onBackgroundMessage((payload) => {
      const data = payload?.data || {};
      const notif = payload?.notification || {};

      const senderName = data.senderName || notif.title || 'Sanvad';
      const preview = data.body || notif.body || data.messagePreview || 'You have a new message';
      const avatar = data.senderAvatar || data.icon || notif.icon || '/pwa-192x192.png';
      const chatId = data.chatId || '';
      const tag = data.tag || (chatId ? `sanvad-chat-${chatId}` : 'sanvad-message');
      const targetUrl = data.url || (chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/');

      return displayBackgroundNotification({
        title: senderName,
        body: preview,
        icon: avatar,
        chatId,
        tag,
        url: targetUrl,
      });
    });
  }
} catch {
  // Fallback to generic push event listener if compat scripts are unreachable offline
  fcmInitialized = false;
}

async function isClientViewingChat(chatId) {
  if (!chatId) return false;
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  return windowClients.some((client) => {
    const isVisible = client.focused || client.visibilityState === 'visible';
    if (!isVisible) return false;
    const tracked = sanvadActiveClients.get(client.id);
    return Boolean(tracked && tracked.visible && tracked.chatId && tracked.chatId === chatId);
  });
}

async function displayBackgroundNotification(details) {
  if (await isClientViewingChat(details.chatId)) {
    return;
  }

  await self.registration.showNotification(details.title || 'Sanvad', {
    body: details.body || 'You have a new message',
    icon: details.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: details.tag || details.chatId || 'sanvad-message',
    renotify: true,
    vibrate: [180, 80, 180],
    data: {
      chatId: details.chatId || '',
      url: details.url || (details.chatId ? `/?chatId=${encodeURIComponent(details.chatId)}` : '/'),
    },
  });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SANVAD_ACTIVE_CHAT' && event.source && event.source.id) {
    sanvadActiveClients.set(event.source.id, {
      chatId: data.chatId || null,
      visible: Boolean(data.visible),
      updatedAt: Date.now(),
    });
  }
});

// Generic Push fallback (when payload is raw Web Push or FCM compat was skipped)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let parsed = null;
  try {
    parsed = event.data.json();
  } catch {
    try {
      const text = event.data.text();
      if (text) parsed = { body: text };
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return;

  // Let FCM onBackgroundMessage handle standard FCM pushes so we don't duplicate
  if (fcmInitialized && (parsed.from || parsed.fcmMessageId || parsed.notification)) {
    return;
  }

  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const chatId = data.chatId || '';

  event.waitUntil(
    displayBackgroundNotification({
      title: data.senderName || data.title || 'Sanvad',
      body: data.body || data.messagePreview || 'New message',
      icon: data.senderAvatar || data.icon || '/pwa-192x192.png',
      chatId,
      tag: data.tag || (chatId ? `sanvad-chat-${chatId}` : 'sanvad-message'),
      url: data.url || (chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/'),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = typeof data.chatId === 'string' ? data.chatId : '';
  const targetUrl =
    typeof data.url === 'string' && data.url
      ? data.url
      : chatId
      ? `/?chatId=${encodeURIComponent(chatId)}`
      : '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            if ('focus' in client) {
              await client.focus();
            }
            if (chatId) {
              client.postMessage({ type: 'SANVAD_OPEN_CHAT', chatId });
            }
            return;
          }
        } catch {
          // Ignore malformed client URL
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
