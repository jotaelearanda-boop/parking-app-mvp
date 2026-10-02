import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../ws.js';
import { stripe } from '../config/stripe.js';
import { moverSaldo } from '../config/saldo.js';
import { liberarAlVendedor } from '../config/liquidar.js';

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
        where id=$1 and estado='disponible' and expira_at > now() and seller_id <> $2
        returning id, seller_id, precio_cents`, [req.params.plazaId, req.user.id]);
    if (!rows[0]) {
      await client.query('rollback');
      const { rows: d } = await query('select seller_id from plazas_activas where id=$1', [req.params.plazaId]);
      return res.status(409).json({ error: d[0]?.seller_id === req.user.id ? 'Esta plaza es tuya: no puedes reservarla' : 'Esta plaza ya no está disponible' });
    }
    const p = rows[0];
    const comision = Math.round((p.precio_cents * env.comisionPct) / 100);
    const tx = (await client.query(
      `insert into transacciones(plaza_id, vendedor_id, comprador_id, monto_cents, comision_cents)
       values ($1,$2,$3,$4,$5) returning id, estado, monto_cents`,
      [p.id, p.seller_id, req.user.id, p.precio_cents, comision])).rows[0];
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
    const { rows } = await query(
      'select name, vehiculo_modelo modelo, vehiculo_color color, vehiculo_matricula matricula from users where id=$1', [otro(t, req.user.id)]);
    out.otro = rows[0];
  }
  res.json(out);
});

// Comprador avisa que llegó → notifica al vendedor ("puedes salir").
r.post('/:id/llegue', cargar, async (req, res) => {
  if (req.user.id !== req.tx.comprador_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Acción no permitida' });
  await query('update transacciones set comprador_llego_at=now() where id=$1', [req.tx.id]);
  notify(req.tx.vendedor_id, 'comprador_llego', { transaccion_id: req.tx.id });
  res.json({ ok: true });
});

// Vendedor se va → el dinero pasa a su saldo (neto de comisión) y se programa el borrado de ubicación (RGPD).
r.post('/:id/salgo', cargar, async (req, res) => {
  if (req.user.id !== req.tx.vendedor_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Acción no permitida' });
  const t = await liberarAlVendedor(req.tx.id, { porSalida: true });
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
