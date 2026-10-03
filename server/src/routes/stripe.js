import { query, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { stripe } from '../config/stripe.js';
import { notify } from '../ws.js';
import { moverSaldo } from '../config/saldo.js';
import { evento } from '../config/audit.js';

// --- Webhook de Stripe: confirma pagos. Necesita el body SIN parsear (express.raw). ---
// (El alta de vendedores con Stripe Connect se retiró: las retiradas de saldo se gestionan desde el backoffice.)
export async function webhook(req, res) {
  if (!stripe || !env.stripeWebhookSecret) return res.status(503).end();
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.stripeWebhookSecret);
  } catch (e) {
    return res.status(400).send(`Firma inválida: ${e.message}`);
  }
  if (ev.type === 'payment_intent.succeeded') {
    const pi = ev.data.object;
    if (pi.metadata?.tipo === 'recarga') {
      // Idempotente por índice único (tipo, stripe_ref): un reintento del webhook no vuelve a abonar.
      const c = await pool.connect();
      try {
        await c.query('begin');
        await moverSaldo(c, pi.metadata.user_id, 'recarga', pi.amount_received, { stripeRef: pi.id });
        await c.query('commit');
        evento('recarga_saldo', { userId: pi.metadata.user_id, data: { importe: pi.amount_received, pi: pi.id } });
        notify(pi.metadata.user_id, 'saldo_recargado', {});
      } catch (e) {
        await c.query('rollback');
        if (e.code !== '23505') throw e;
      } finally { c.release(); }
      return res.json({ received: true });
    }
    // Idempotente: solo pasa de pendiente_pago a en_escrow una vez.
    const { rows } = await query(
      `update transacciones set estado='en_escrow'
        where stripe_payment_intent=$1 and estado='pendiente_pago' returning id, vendedor_id, comprador_id`, [pi.id]);
    if (rows[0]) {
      evento('pago_confirmado', { userId: rows[0].comprador_id, data: { transaccion: rows[0].id, pi: pi.id, importe: pi.amount_received } });
      notify(rows[0].vendedor_id, 'plaza_pagada', { transaccion_id: rows[0].id });
      notify(rows[0].comprador_id, 'pago_confirmado', { transaccion_id: rows[0].id });
    }
  }
  if (ev.type === 'payment_intent.payment_failed') {
    evento('stripe_pago_fallido', { data: { pi: ev.data.object.id, error: ev.data.object.last_payment_error?.message } });
  }
  res.json({ received: true });
}
