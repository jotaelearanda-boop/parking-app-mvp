import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../ws.js';
import { stripe } from '../config/stripe.js';

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
    if (!rows[0]) { await client.query('rollback'); return res.status(409).json({ error: 'Plaza no disponible' }); }
    const p = rows[0];
    const comision = Math.round((p.precio_cents * env.comisionPct) / 100);
    const tx = (await client.query(
      `insert into transacciones(plaza_id, vendedor_id, comprador_id, monto_cents, comision_cents)
       values ($1,$2,$3,$4,$5) returning id, estado, monto_cents`,
      [p.id, p.seller_id, req.user.id, p.precio_cents, comision])).rows[0];
    let client_secret;
    if (stripe) {
      // Cobro a la plataforma (escrow): el dinero queda en el balance de Stripe hasta "SALGO".
      const pi = await stripe.paymentIntents.create({
        amount: p.precio_cents, currency: 'eur', automatic_payment_methods: { enabled: true },
        transfer_group: tx.id, metadata: { transaccion_id: tx.id },
      }, { idempotencyKey: `pi-${tx.id}` });
      await client.query('update transacciones set stripe_payment_intent=$1 where id=$2', [pi.id, tx.id]);
      client_secret = pi.client_secret;
    }
    await client.query('commit');
    tx.client_secret = client_secret;
    notify(p.seller_id, 'comprador_interesado', { transaccion_id: tx.id, comprador: req.user.name });
    res.status(201).json(tx);
  } catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); }
});

// Detalle. Ubicación exacta y foto solo tras pagar (en_escrow) y para el comprador.
r.get('/:id', cargar, async (req, res) => {
  const t = req.tx;
  const out = { ...t };
  if (req.user.id === t.comprador_id && ['en_escrow', 'liberada'].includes(t.estado)) {
    const { rows } = await query(
      `select ST_Y(geo::geometry) lat, ST_X(geo::geometry) lng, foto_matricula_url from plazas_activas where id=$1`, [t.plaza_id]);
    Object.assign(out, rows[0]);
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

// Vendedor se va → libera fondos (transfer Stripe en semana 3) y programa borrado de ubicación (RGPD).
r.post('/:id/salgo', cargar, async (req, res) => {
  if (req.user.id !== req.tx.vendedor_id || req.tx.estado !== 'en_escrow')
    return res.status(409).json({ error: 'Acción no permitida' });
  if (stripe) {
    // Libera al vendedor lo cobrado menos la comisión de la plataforma.
    const pi = await stripe.paymentIntents.retrieve(req.tx.stripe_payment_intent);
    await stripe.transfers.create({
      amount: req.tx.monto_cents - req.tx.comision_cents, currency: 'eur',
      destination: req.user.stripe_account_id, source_transaction: pi.latest_charge,
      transfer_group: req.tx.id, metadata: { transaccion_id: req.tx.id },
    }, { idempotencyKey: `tr-${req.tx.id}` });
  }
  await query(`update transacciones set estado='liberada', vendedor_salio_at=now(),
               location_purge_at=now() + interval '1 hour' where id=$1`, [req.tx.id]);
  await query(`update plazas_activas set estado='completada' where id=$1`, [req.tx.plaza_id]);
  notify(req.tx.comprador_id, 'plaza_lista', { transaccion_id: req.tx.id });
  res.json({ ok: true });
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
