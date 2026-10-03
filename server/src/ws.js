// WebSocket para notificaciones y chat en tiempo real. Auth con JWT en ?token=
import { WebSocketServer } from 'ws';
import { verifyToken } from './middleware/auth.js';
import { enviarPush, textoPush } from './config/push.js';

const conexiones = new Map(); // userId -> Set<WebSocket>

export function attachWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    let userId;
    try {
      userId = verifyToken(new URL(req.url, 'http://x').searchParams.get('token'));
    } catch { return socket.close(4401, 'No autenticado'); }
    if (!conexiones.has(userId)) conexiones.set(userId, new Set());
    conexiones.get(userId).add(socket);
    socket.on('close', () => conexiones.get(userId)?.delete(socket));
  });
}

// Envía {tipo, ...datos} a las pestañas abiertas del usuario. Si no tiene la app abierta, manda un push.
export function notify(userId, tipo, datos = {}) {
  const msg = JSON.stringify({ tipo, ...datos });
  let abiertas = 0;
  for (const s of conexiones.get(userId) ?? []) if (s.readyState === 1) { s.send(msg); abiertas++; }
  if (!abiertas) {
    const t = textoPush(tipo, datos);
    if (t) enviarPush(userId, t).catch(() => {});
  }
}
