// Firebase Messaging Service Worker
// Handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDJBfmCyZtw7WkG4BGE5XDOhNF0p92DDL4',
  authDomain: 'prime-mechanic-463314-m8.firebaseapp.com',
  projectId: 'prime-mechanic-463314-m8',
  storageBucket: 'prime-mechanic-463314-m8.firebasestorage.app',
  messagingSenderId: '191399963434',
  appId: '1:191399963434:web:bd1331f0af045af636cc53',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Bear House';
  const body = payload.notification?.body ?? '';
  const icon = payload.notification?.icon ?? '/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icon-192.png',
    data: payload.data ?? {},
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
