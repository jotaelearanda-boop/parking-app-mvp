// Envío de notificaciones push a los dispositivos suscritos de un usuario.
import webpush from 'web-push';
import { query } from './db.js';
import { push as cfg } from './env.js';
import { evento } from './audit.js';

export const pushDisponible = !!(cfg.publicKey && cfg.privateKey);
if (pushDisponible) webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

// Devuelve cuántos dispositivos recibieron el aviso. Borra las suscripciones caducadas (404/410).
export async function enviarPush(userId, { titulo, cuerpo, url = '/', tag }) {
  if (!pushDisponible) return 0;
  const { rows } = await query('select id, endpoint, p256dh, auth from push_subs where user_id=$1', [userId]);
  let enviados = 0;
  const payload = JSON.stringify({ titulo, cuerpo, url, tag });
  for (const s of rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' });
      enviados++;
      query('update push_subs set last_ok_at=now() where id=$1', [s.id]).catch(() => {});
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await query('delete from push_subs where id=$1', [s.id]).catch(() => {});
      else evento('push_error', { userId, data: { status: e.statusCode, msg: String(e.body ?? e.message).slice(0, 120) } });
    }
  }
  return enviados;
}

// Texto de cada evento cuando hay que avisar a alguien que no tiene la app abierta.
export function textoPush(tipo, d = {}) {
  const t = d.transaccion_id ? `/transaccion/${d.transaccion_id}` : '/coche';
  switch (tipo) {
    case 'match': return { titulo: '¡Match! 🚘', cuerpo: d.distancia_m != null ? `Hay una plaza a ${d.distancia_m} m de ti. Toca para verla.` : 'Hay una plaza cerca de ti. Toca para verla.', url: `/?plaza=${d.plaza_id}`, tag: 'match' };
    case 'comprador_interesado': return { titulo: '¡Match! 🚘', cuerpo: 'Alguien ha reservado tu plaza.', url: t, tag: 'reserva' };
    case 'plaza_pagada': return { titulo: 'Plaza pagada ✅', cuerpo: 'Cuando te vayas, pulsa SALGO para cobrar.', url: t, tag: 'pago' };
    case 'comprador_llego': return { titulo: 'Tu comprador ha llegado 👀', cuerpo: 'Ya puedes salir de la plaza.', url: t, tag: 'llego' };
    case 'plaza_lista': return { titulo: '¡Plaza lista! 🅿️', cuerpo: 'El vendedor ya se ha ido. Es tuya.', url: t, tag: 'lista' };
    case 'chat': return { titulo: 'Nuevo mensaje', cuerpo: String(d.mensaje?.texto ?? '').slice(0, 120), url: t, tag: `chat-${d.transaccion_id}` };
    case 'disputa_abierta': return { titulo: 'Problema reportado', cuerpo: 'El comprador ha reportado un problema con la plaza.', url: t, tag: 'disputa' };
    case 'reembolsado': return { titulo: 'Importe reembolsado', cuerpo: 'Se ha reembolsado la reserva.', url: t, tag: 'reembolso' };
    case 'retirada_pagada': return { titulo: 'Retirada pagada 💸', cuerpo: 'Ya hemos enviado tu dinero.', url: '/saldo', tag: 'retirada' };
    case 'retirada_rechazada': return { titulo: 'Retirada no pagada', cuerpo: 'El saldo ha vuelto a tu cuenta. Revisa los datos.', url: '/saldo', tag: 'retirada' };
    default: return null;                                               // el resto de eventos solo se ven con la app abierta
  }
}
