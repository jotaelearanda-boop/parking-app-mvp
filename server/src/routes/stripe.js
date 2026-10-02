import { Router } from 'express';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { stripe, requireStripe } from '../config/stripe.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../ws.js';

// --- Onboarding del vendedor (cuenta Express de Stripe Connect) ---
export const router = Router();

router.post('/onboarding', requireAuth, requireStripe, async (req, res) => {
  let acct = req.user.stripe_account_id;
  if (!acct) {
    const a = await stripe.accounts.create({
      type: 'express', country: 'ES', email: req.user.email,
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { user_id: req.user.id },
    });
    acct = a.id;
    await query('update users set stripe_account_id=$1 where id=$2', [acct, req.user.id]);
  }
  const link = await stripe.accountLinks.create({
    account: acct, type: 'account_onboarding',
    return_url: `${env.clientOrigin}/vender?stripe=ok`, refresh_url: `${env.clientOrigin}/vender?stripe=reintentar`,
  });
  res.json({ url: link.url });
});

// ¿Puede cobrar este vendedor? (cuenta con transferencias activas)
export async function vendedorListo(user) {
  if (!stripe) return true; // modo dev sin Stripe
  if (!user.stripe_account_id) return false;
  const a = await stripe.accounts.retrieve(user.stripe_account_id);
  return a.capabilities?.transfers === 'active';
}

router.get('/estado', requireAuth, async (req, res) => {
  res.json({ configurado: !!stripe, listo: await vendedorListo(req.user) });
});

// --- Webhook: confirma pagos. Necesita el body SIN parsear (express.raw). ---
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
    // Idempotente: solo pasa de pendiente_pago a en_escrow una vez.
    const { rows } = await query(
      `update transacciones set estado='en_escrow'
        where stripe_payment_intent=$1 and estado='pendiente_pago' returning id, vendedor_id, comprador_id`, [pi.id]);
    if (rows[0]) {
      notify(rows[0].vendedor_id, 'plaza_pagada', { transaccion_id: rows[0].id });
      notify(rows[0].comprador_id, 'pago_confirmado', { transaccion_id: rows[0].id });
    }
  }
  if (ev.type === 'payment_intent.payment_failed') {
    await query('insert into eventos(tipo, payload) values ($1,$2)', ['stripe_pago_fallido', ev.data.object]);
  }
  res.json({ received: true });
}
