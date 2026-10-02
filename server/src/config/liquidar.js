// Liquidación de transacciones: pagar al vendedor o reembolsar al comprador. Siempre idempotente.
import { pool, query } from './db.js';
import { stripe } from './stripe.js';
import { moverSaldo } from './saldo.js';
import { notify } from '../ws.js';
import { evento } from './audit.js';

// en_escrow|disputada -> liberada. Abona al vendedor (monto - comisión) y cierra la plaza.
export async function liberarAlVendedor(txId, { porSalida = false } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows } = await c.query(
      `update transacciones set estado='liberada', vendedor_salio_at = case when $2 then now() else vendedor_salio_at end,
              location_purge_at = now() + interval '1 hour'
        where id=$1 and estado in ('en_escrow','disputada') returning *`, [txId, porSalida]);
    const t = rows[0];
    if (!t) { await c.query('rollback'); return null; }
    await moverSaldo(c, t.vendedor_id, 'venta', t.monto_cents - t.comision_cents, { transaccionId: t.id });
    await c.query("update plazas_activas set estado='completada' where id=$1", [t.plaza_id]);
    await c.query("update disputas set estado='rechazada' where transaccion_id=$1 and estado='abierta'", [t.id]);
    await c.query('commit');
    evento('pago_liberado_al_vendedor', { userId: t.vendedor_id, data: { transaccion: t.id, neto: t.monto_cents - t.comision_cents, comision: t.comision_cents } });
    notify(t.comprador_id, 'plaza_lista', { transaccion_id: t.id });
    return t;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

// en_escrow|disputada|pendiente_pago -> reembolsada. Saldo -> saldo; tarjeta -> reembolso Stripe.
export async function reembolsar(txId) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows } = await c.query(
      `update transacciones set estado='reembolsada', location_purge_at = now() + interval '1 hour'
        where id=$1 and estado in ('en_escrow','disputada') returning *`, [txId]);
    const t = rows[0];
    if (!t) { await c.query('rollback'); return null; }
    if (t.pago_con_saldo) {
      await moverSaldo(c, t.comprador_id, 'reembolso', t.monto_cents, { transaccionId: t.id });
    } else if (stripe && t.stripe_payment_intent) {
      await stripe.refunds.create({ payment_intent: t.stripe_payment_intent }, { idempotencyKey: `rf-${t.id}` });
    }
    await c.query("update plazas_activas set estado='cancelada' where id=$1", [t.plaza_id]);
    await c.query("update disputas set estado='reembolsada' where transaccion_id=$1 and estado='abierta'", [t.id]);
    await c.query('commit');
    evento('reembolso', { userId: t.comprador_id, data: { transaccion: t.id, importe: t.monto_cents, via: t.pago_con_saldo ? 'saldo' : 'tarjeta' } });
    notify(t.comprador_id, 'reembolsado', { transaccion_id: t.id });
    notify(t.vendedor_id, 'reembolsado', { transaccion_id: t.id });
    return t;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

export const registrarEvento = (tipo, payload) =>
  query('insert into eventos(tipo, payload) values ($1,$2)', [tipo, payload]).catch(() => {});
