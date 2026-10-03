import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../ws.js';
import { stripe } from '../config/stripe.js';
import { moverSaldo } from '../config/saldo.js';
import { liberarAlVendedor } from '../config/liquidar.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

// Carga la transacción y comprueba que el usuario participa.
async function cargar(req, res, next) {
  const { rows } = await query('select * from transacciones where id=$1', [req.params.id]);
  const t = rows[0];
  if (!t || ![t.vendedor_id, t.comprador_id].includes(req.user.id))
    return res.status(404).json({ error: 'Transacción no encontrada' });
  req.tx = t;
  next();
}
const otro = (t, uid) => (t.vendedor_id === uid ? t.comprador_id : t.vendedor_id);

// Mis transacciones (como comprador o vendedor), más recientes primero.
r.get('/', async (req, res) => {
  const { rows } = await query(
    `select t.id, t.estado, t.monto_cents, t.created_at,
            (t.vendedor_id = $1) as soy_vendedor
       from transacciones t where $1 in (t.vendedor_id, t.comprador_id)
      order by t.created_at desc limit 20`, [req.user.id]);
  res.json({ transacciones: rows });
});

// SOLO DESARROLLO: simula el pago hasta integrar Stripe (semana 3). Desactivado en producción.
if (process.env.NODE_ENV !== 'production' && !stripe) {
  r.post('/:id/dev-pagar', cargar, async (req, res) => {
    if (req.user.id !== req.tx.comprador_id || req.tx.estado !== 'pendiente_pago')
      return res.status(409).json({ error: 'Acción no permitida' });
    await query("update transacciones set estado='en_escrow' where id=$1", [req.tx.id]);
    notify(req.tx.vendedor_id, 'plaza_pagada', { transaccion_id: req.tx.id });
    res.json({ ok: true });
  });
}

// Comprador reserva una plaza. El pago (Stripe) se engancha aquí en la semana 3.
r.post('/reservar/:plazaId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // UPDATE condicional: solo uno gana si dos compradores reservan a la vez.
    const { rows } = await client.query(
      `update plazas_activas set estado='reservada'
        where id=$1 and estado='disponible' and seller_id <> $2
        returning id, seller_id, precio_cents`, [req.params.plazaId, req.user.id]);
    if (!rows[0]) {
      await client.query('rollback');
      const { rows: d } = await query('select seller_id from plazas_activas where id=$1', [req.params.plazaId]);
      return res.status(409).json({ error: d[0]?.seller_id === req.user.id ? 'Esta plaza es tuya: no puedes reservarla' : 'Esta plaza ya no está disponible' });
    }
    const p = rows[0];
    const { rows: vh } = await client.query(
      `select id from vehiculos where user_id=$1 and borrado_at is null and ($2::uuid is null or id=$2) order by principal desc limit 1`,
      [req.user.id, /^[0-9a-f-]{36}$/i.test(req.body?.vehiculo_id ?? '') ? req.body.vehiculo_id : null]);
    const comision = Math.round((p.precio_cents * env.comisionPct) / 100);
    const tx = (await client.query(
      `insert into transacciones(plaza_id, vendedor_id, comprador_id, monto_cents, comision_cents, comprador_vehiculo_id)
       values ($1,$2,$3,$4,$5,$6) returning id, estado, monto_cents`,
      [p.id, p.seller_id, req.user.id, p.precio_cents, comision, vh[0]?.id ?? null])).rows[0];
    let client_secret;
    // ¿Alcanza el saldo? Se descuenta y la plaza queda pagada al instante (sin pasar por Stripe, sin tarifa).
    await client.query('select 1 from users where id=$1 for update', [req.user.id]);
    const saldo = (await client.query('select saldo_cents from users where id=$1', [req.user.id])).rows[0].saldo_cents;
    // Se paga con saldo si alcanza, salvo que el comprador pida expresamente pagar con tarjeta (usar_saldo=false).
    if (saldo >= p.precio_cents && req.body?.usar_saldo !== false) {
      await moverSaldo(client, req.user.id, 'pago_plaza', -p.precio_cents, { transaccionId: tx.id });
      await client.query("update transacciones set estado='en_escrow', pago_con_saldo=true where id=$1", [tx.id]);
      tx.estado = 'en_escrow'; tx.pago_con_saldo = true;
    } else if (stripe) {
      // Cobro a la plataforma (escrow): el dinero queda en el balance de Stripe hasta "SALGO".
      const pi = await stripe.paymentIntents.create({
        amount: p.precio_cents, currency: 'eur', automatic_payment_methods: { enabled: true },
        transfer_group: tx.id, metadata: { tipo: 'plaza', transaccion_id: tx.id },
      }, { idempotencyKey: `pi-${tx.id}` });
      await client.query('update transacciones set stripe_payment_intent=$1 where id=$2', [pi.id, tx.id]);
      client_secret = pi.client_secret;
    }
    await client.query('commit');
    tx.client_secret = client_secret;
    if (tx.estado === 'en_escrow') notify(p.seller_id, 'plaza_pagada', { transaccion_id: tx.id });
    evento('reserva', { userId: req.user.id, ip: req.ip, data: { transaccion: tx.id, importe: p.precio_cents, con_saldo: !!tx.pago_con_saldo } });
    notify(p.seller_id, 'comprador_interesado', { transaccion_id: tx.id, comprador: req.user.name });
    res.status(201).json(tx);
  } catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); }
});

// Detalle. Ubicación exacta solo tras pagar (en_escrow) y para el comprador.
r.get('/:id', cargar, async (req, res) => {
  const t = req.tx;
  const out = { ...t };
  if (req.user.id === t.comprador_id && ['en_escrow', 'liberada'].includes(t.estado)) {
    const { rows } = await query(
      `select ST_Y(geo::geometry) lat, ST_X(geo::geometry) lng from plazas_activas where id=$1`, [t.plaza_id]);
    Object.assign(out, rows[0]);
  }
  // Tras pagar, cada parte ve el coche de la otra (como Uber) para reconocerse en la calle.
  if (['en_escrow', 'liberada', 'disputada'].includes(t.estado)) {
    // Coche concreto de esa operación (el de la plaza para el vendedor, el elegido al reservar para el comprador); si falta, el principal.
    const elOtroEsVendedor = otro(t, req.user.id) === t.vendedor_id;
    const { rows } = await query(
      `select u.name, v.modelo, v.color, v.matricula from users u
         left join vehiculos v on v.id = coalesce(
           case when $4::boolean then (select p.vehiculo_id from plazas_activas p where p.id=$3) else $2::uuid end,
           (select id from vehiculos where user_id=u.id and principal and borrado_at is null))
        where u.id=$1`, [otro(t, req.user.id), t.comprador_vehiculo_id, t.plaza_id, elOtroEsVendedor]);
    out.otro = rows[0];
  }
  res.json(out);
});

// Seguimiento en vivo: el comprador envía su posición mientras viene; el vendedor la consulta.
r.post('/:id/posicion', cargar, async (req, res) => {
  const p = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Posición no válida' });
  if (req.user.id !== req.tx.comprador_id || req.tx.estado !== 'en_escrow' || req.tx.comprador_llego_at)
    return res.status(409).json({ error: 'Seguimiento no activo' });
  await query(
    `insert into seguimiento(transaccion_id, geo, updated_at) values ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, now())
     on conflict (transaccion_id) do update set geo=excluded.geo, updated_at=now()`, [req.tx.id, p.data.lat, p.data.lng]);
  res.json({ ok: true });
});

// Para el vendedor: dónde va el comprador, a cuántos metros está y un tiempo estimado (aproximado, en coche por ciudad).
r.get('/:id/seguimiento', cargar, async (req, res) => {
  if (req.user.id !== req.tx.vendedor_id) return res.status(403).json({ error: 'Solo el vendedor' });
  if (req.tx.estado !== 'en_escrow') return res.json({ activo: false });
  const { rows } = await query(
    `select ST_Y(s.geo::geometry) lat, ST_X(s.geo::geometry) lng, s.updated_at,
            ST_Y(p.geo::geometry) plaza_lat, ST_X(p.geo::geometry) plaza_lng,
            round(ST_Distance(s.geo, p.geo))::int as distancia_m
       from plazas_activas p left join seguimiento s on s.transaccion_id=$1 where p.id=$2`, [req.tx.id, req.tx.plaza_id]);
  const s = rows[0];
  if (!s?.plaza_lat) return res.json({ activo: false });
  // Estimación: ~1,3 × la distancia en línea recta a ~20 km/h de media en ciudad.
  const eta_min = s.distancia_m != null ? Math.max(1, Math.round((s.distancia_m * 1.3) / (20000 / 60))) : null;
  res.json({ activo: true, llego: !!req.tx.comprador_llego_at, ...s, eta_min, segundos: s.updated_at ? Math.round((Date.now() - new Date(s.updated_at)) / 1000) : null });
});

// Comprador avisa que llegó → notifica al vendedor ("puedes salir").
r.post('/:id/llegue', cargar, async (req, res) => {
  if (req.user.id !== req.tx.comprador_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Acción no permitida' });
  await query('update transacciones set comprador_llego_at=now() where id=$1', [req.tx.id]);
  await query('delete from seguimiento where transaccion_id=$1', [req.tx.id]);
  notify(req.tx.vendedor_id, 'comprador_llego', { transaccion_id: req.tx.id });
  res.json({ ok: true });
});

// Vendedor se va → el dinero pasa a su saldo (neto de comisión) y se programa el borrado de ubicación (RGPD).
r.post('/:id/salgo', cargar, async (req, res) => {
  if (req.user.id !== req.tx.vendedor_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Acción no permitida' });
  const t = await liberarAlVendedor(req.tx.id, { porSalida: true });
  if (t) evento('salida_confirmada', { userId: req.user.id, ip: req.ip, data: { transaccion: req.tx.id } });
  t ? res.json({ ok: true }) : res.status(409).json({ error: 'Ya liberada' });
});

// Comprador reporta un problema ("no había plaza"). Bloquea la liberación hasta que un admin resuelva;
// si pasan 24 h sin resolución, el job reembolsa automáticamente.
r.post('/:id/disputa', cargar, async (req, res) => {
  const p = z.object({ motivo: z.string().trim().min(3).max(500) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Indica el motivo' });
  if (req.user.id !== req.tx.comprador_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Solo puedes reportar una compra pagada y aún no liberada' });
  const up = await query("update transacciones set estado='disputada' where id=$1 and estado='en_escrow'", [req.tx.id]);
  if (!up.rowCount) return res.status(409).json({ error: 'No se puede reportar' });
  await query('insert into disputas(transaccion_id, reportada_por, motivo) values ($1,$2,$3)', [req.tx.id, req.user.id, p.data.motivo]);
  evento('disputa_abierta', { userId: req.user.id, ip: req.ip, data: { transaccion: req.tx.id, motivo: p.data.motivo } });
  notify(req.tx.vendedor_id, 'disputa_abierta', { transaccion_id: req.tx.id });
  res.status(201).json({ ok: true });
});

// Valoración 1-5 de la otra parte, solo tras completarse. Actualiza reputación y aplica avisos/suspensiones.
r.post('/:id/rating', cargar, async (req, res) => {
  const p = z.object({ estrellas: z.coerce.number().int().min(1).max(5) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Valoración de 1 a 5' });
  if (req.tx.estado !== 'liberada') return res.status(409).json({ error: 'Solo se valora una transacción completada' });
  const destino = otro(req.tx, req.user.id);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('insert into ratings(transaccion_id, autor_id, destino_id, estrellas) values ($1,$2,$3,$4)',
      [req.tx.id, req.user.id, destino, p.data.estrellas]);
    const { rows } = await client.query(
      `update users set rating_count = rating_count + 1,
              rating_avg = round(((rating_avg * rating_count) + $2) / (rating_count + 1), 2)
        where id=$1 returning rating_avg, rating_count`, [destino, p.data.estrellas]);
    const { rating_avg, rating_count } = rows[0];
    // Reglas de confianza: tras 3 valoraciones, <3 ★ = aviso; <2 ★ = suspensión temporal de 7 días.
    if (rating_count >= 3 && rating_avg < 2)
      await client.query("update users set suspended_until = now() + interval '7 days' where id=$1", [destino]);
    else if (rating_count >= 3 && rating_avg < 3)
      await client.query('update users set advertido_at = now() where id=$1', [destino]);
    await client.query('commit');
    if (rating_count >= 3 && rating_avg < 3)
      notify(destino, 'aviso_reputacion', { transaccion_id: req.tx.id, suspendido: rating_avg < 2 });
    res.status(201).json({ ok: true });
  } catch (e) {
    await client.query('rollback');
    if (e.code === '23505') return res.status(409).json({ error: 'Ya has valorado esta transacción' });
    throw e;
  } finally { client.release(); }
});

// Chat simple por transacción (histórico + WebSocket).
r.get('/:id/chat', cargar, async (req, res) => {
  const { rows } = await query('select id, autor_id, texto, created_at from chats where transaccion_id=$1 order by id', [req.tx.id]);
  res.json({ mensajes: rows });
});
r.post('/:id/chat', cargar, async (req, res) => {
  const p = z.object({ texto: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Mensaje inválido' });
  const { rows } = await query(
    'insert into chats(transaccion_id, autor_id, texto) values ($1,$2,$3) returning id, autor_id, texto, created_at',
    [req.tx.id, req.user.id, p.data.texto]);
  notify(otro(req.tx, req.user.id), 'chat', { transaccion_id: req.tx.id, mensaje: rows[0] });
  res.status(201).json(rows[0]);
});

export default r;
