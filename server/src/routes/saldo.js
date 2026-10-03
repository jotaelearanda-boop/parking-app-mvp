import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { stripe, requireStripe } from '../config/stripe.js';
import { requireAuth } from '../middleware/auth.js';
import { moverSaldo, SALDO_MAX_CENTS, RECARGA_MIN_CENTS, RETIRADA_MIN_CENTS } from '../config/saldo.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

r.get('/', async (req, res) => {
  const { rows } = await query(
    'select tipo, monto_cents, transaccion_id, created_at from saldo_movimientos where user_id=$1 order by id desc limit 30', [req.user.id]);
  res.json({
    saldo_cents: req.user.saldo_cents, movimientos: rows,
    limites: { recarga_min: RECARGA_MIN_CENTS, saldo_max: SALDO_MAX_CENTS, retirada_min: RETIRADA_MIN_CENTS },
    retirada_pendiente: (await query("select id, importe_cents, metodo, solicitada_at from retiradas where user_id=$1 and estado='pendiente'", [req.user.id])).rows[0] ?? null,
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

// --- Retiradas: sin cuenta de Stripe. El usuario indica Bizum o IBAN; el equipo la paga desde el backoffice. ---
function ibanValido(texto) {
  const iban = String(texto ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  const reordenado = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of reordenado) resto = Number(String(resto) + String(ch >= 'A' ? ch.charCodeAt(0) - 55 : ch)) % 97;
  return resto === 1 ? iban : null;                                   // comprobación mod-97 del IBAN
}
const telefonoBizum = (t) => {
  const n = String(t ?? '').replace(/[\s.-]/g, '').replace(/^(\+34|0034)/, '');
  return /^[67]\d{8}$/.test(n) ? n : null;                           // móvil español (Bizum)
};

r.post('/retirar', async (req, res) => {
  const b = req.body ?? {};
  let destino;
  if (b.metodo === 'bizum') {
    const tel = telefonoBizum(b.telefono);
    if (!tel) return res.status(400).json({ error: 'Introduce un móvil español válido para el Bizum' });
    destino = { metodo: 'bizum', telefono: tel, iban: null, titular: null };
  } else if (b.metodo === 'iban') {
    const iban = ibanValido(b.iban);
    const titular = String(b.titular ?? '').trim();
    if (!iban) return res.status(400).json({ error: 'El IBAN no es válido' });
    if (titular.length < 3 || titular.length > 100) return res.status(400).json({ error: 'Indica el nombre del titular de la cuenta' });
    destino = { metodo: 'iban', telefono: null, iban, titular };
  } else return res.status(400).json({ error: 'Elige Bizum o transferencia' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select 1 from users where id=$1 for update', [req.user.id]);
    const { rows: u } = await client.query('select saldo_cents from users where id=$1', [req.user.id]);
    const importe = u[0].saldo_cents;
    if (importe < RETIRADA_MIN_CENTS) { await client.query('rollback'); return res.status(409).json({ error: `Mínimo para retirar: ${RETIRADA_MIN_CENTS / 100} €` }); }
    const { rows } = await client.query(
      `insert into retiradas(user_id, importe_cents, metodo, telefono, iban, titular) values ($1,$2,$3,$4,$5,$6) returning id`,
      [req.user.id, importe, destino.metodo, destino.telefono, destino.iban, destino.titular]);
    await moverSaldo(client, req.user.id, 'retirada', -importe, { stripeRef: `retirada-${rows[0].id}` });
    await client.query('commit');
    evento('retirada_solicitada', { userId: req.user.id, ip: req.ip, data: { id: rows[0].id, importe, metodo: destino.metodo } });
    res.status(201).json({ id: rows[0].id, importe_cents: importe });
  } catch (e) {
    await client.query('rollback');
    if (e.code === '23505') return res.status(409).json({ error: 'Ya tienes una retirada pendiente' });
    throw e;
  } finally { client.release(); }
});

export default r;
