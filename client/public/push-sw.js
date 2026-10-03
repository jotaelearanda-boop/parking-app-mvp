// Notificaciones push: se importa dentro del service worker que genera la PWA.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data.json(); } catch { d = { titulo: 'Parking P2P', cuerpo: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.titulo || 'Parking P2P', {
    body: d.cuerpo || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' },
  }));
});

// Al tocar el aviso: abre (o reutiliza) la app en la pantalla correspondiente.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) if ('focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
