// Conexión WebSocket con reconexión simple. Los listeners reciben {tipo, ...datos}.
import { getToken } from './api.js';

const listeners = new Set();
let socket, timer;

export function conectarWs() {
  if (!getToken() || socket) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.VITE_WS_URL ?? `${proto}://${location.host}/ws`;
  socket = new WebSocket(`${host}?token=${getToken()}`);
  socket.onmessage = (e) => { try { const m = JSON.parse(e.data); listeners.forEach((l) => l(m)); } catch {} };
  socket.onclose = () => { socket = null; clearTimeout(timer); if (getToken()) timer = setTimeout(conectarWs, 3000); };
}
export function cerrarWs() { clearTimeout(timer); const s = socket; socket = null; s?.close(); }
export function onMensaje(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
