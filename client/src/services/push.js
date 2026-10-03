// Notificaciones push en el navegador (Web Push). En iPhone solo funcionan con la app añadida a la pantalla de inicio.
import { api } from './api.js';

export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const esInstalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const aBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

// 'no-soportado' | 'instalar' (iPhone sin instalar) | 'bloqueado' | 'inactivo' | 'activo'
export async function estadoPush() {
  if (!pushSoportado()) return esIOS() && !esInstalada() ? 'instalar' : 'no-soportado';
  if (esIOS() && !esInstalada()) return 'instalar';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

export async function activarPush() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No has dado permiso para las notificaciones');
  const { disponible, publicKey } = await api.pushClave();
  if (!disponible) throw new Error('Las notificaciones aún no están disponibles en el servidor');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publicKey) }));
  await api.pushSuscribir(sub.toJSON());
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api.pushBaja(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
}
