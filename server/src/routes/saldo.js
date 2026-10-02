import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { stripe, requireStripe } from '../config/stripe.js';
import { requireAuth } from '../middleware/auth.js';
import { moverSaldo, SALDO_MAX_CENTS, RECARGA_MIN_CENTS, RETIRADA_MIN_CENTS } from '../config/saldo.js';
import { vendedorListo } from './stripe.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

r.get('/', async (req, res) => {
  const { rows } = await query(
    'select tipo, monto_cents, transaccion_id, created_at from saldo_movimientos where user_id=$1 order by id desc limit 30', [req.user.id]);
  res.json({
    saldo_cents: req.user.saldo_cents, movimientos: rows,
    limites: { recarga_min: RECARGA_MIN_CENTS, saldo_max: SALDO_MAX_CENTS, retirada_min: RETIRADA_MIN_CENTS },
    cobros_listos: await vendedorListo(req.user),
  });
});

// Recarga con tarjeta/Apple Pay/Google Pay. El saldo se abona al confirmarse el webhook.
r.post('/recargar', requireStripe, async (req, res) => {
  const p = z.object({ cents: z.coerce.number().int().min(RECARGA_MIN_CENTS) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: `Recarga mínima ${RECARGA_MIN_CENTS / 100} €` });
  if (req.user.saldo_cents + p.data.cents > SALDO_MAX_CENTS)
    return res.status(409).json({ error: `El saldo no puede superar ${SALDO_MAX_CENTS / 100} €` });
  const pi = await stripe.paymentIntents.create({
    amount: p.data.cents, currency: 'eur', automatic_payment_methods: { enabled: true },
    metadata: { tipo: 'recarga', user_id: req.user.id },
  });
  res.status(201).json({ client_secret: pi.client_secret });
});

// Retirada del saldo a la cuenta bancaria vía Stripe Connect (requiere alta con verificación).
r.post('/retirar', requireStripe, async (req, res) => {
  const { saldo_cents, stripe_account_id } = req.user;
  if (saldo_cents < RETIRADA_MIN_CENTS)
    return res.status(409).json({ error: `Mínimo para retirar: ${RETIRADA_MIN_CENTS / 100} €` });
  if (!(await vendedorListo(req.user)))
    return res.status(402).json({ error: 'Completa la verificación de cobros para retirar', codigo: 'stripe_onboarding' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Primero se descuenta (con bloqueo de fila) y luego se transfiere; si Stripe falla, se revierte todo.
    await client.query('select 1 from users where id=$1 for update', [req.user.id]);
    const ref = `retirada-${req.user.id}-${Date.now()}`;
    await moverSaldo(client, req.user.id, 'retirada', -saldo_cents, { stripeRef: ref });
    await stripe.transfers.create({
      amount: saldo_cents, currency: 'eur', destination: stripe_account_id, metadata: { ref },
    }, { idempotencyKey: ref });
    await client.query('commit');
    evento('retirada_saldo', { userId: req.user.id, ip: req.ip, data: { importe: saldo_cents } });
    res.json({ retirado_cents: saldo_cents });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally { client.release(); }
});

export default r;
