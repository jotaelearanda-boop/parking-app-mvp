import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { liberarAlVendedor, reembolsar } from '../config/liquidar.js';

const r = Router();
r.use(requireAuth, requireAdmin);

// Métricas: transacciones del día, comisiones ganadas y KPIs del MVP.
r.get('/resumen', async (_q, res) => {
  const [hoy, total, usuarios, plazas, rating, disputas] = await Promise.all([
    query(`select count(*)::int n, coalesce(sum(monto_cents),0)::int volumen, coalesce(sum(comision_cents),0)::int comision
             from transacciones where estado='liberada' and created_at >= date_trunc('day', now())`),
    query(`select count(*)::int n, coalesce(sum(comision_cents),0)::int comision from transacciones where estado='liberada'`),
    query(`select count(*)::int total, count(*) filter (where created_at >= now() - interval '7 days')::int ult7 from users`),
    query(`select count(*)::int hoy from plazas_activas where created_at >= date_trunc('day', now())`),
    query(`select coalesce(round(avg(rating_avg) filter (where rating_count > 0),2),0) avg from users`),
    query(`select count(*)::int abiertas from disputas where estado='abierta'`),
  ]);
  res.json({ hoy: hoy.rows[0], total: total.rows[0], usuarios: usuarios.rows[0], plazas_hoy: plazas.rows[0].hoy,
             rating_medio: rating.rows[0].avg, disputas_abiertas: disputas.rows[0].abiertas });
});

r.get('/disputas', async (_q, res) => {
  const { rows } = await query(
    `select d.id, d.transaccion_id, d.motivo, d.estado, d.created_at, t.monto_cents,
            v.name vendedor, v.email vendedor_email, c.name comprador, c.email comprador_email
       from disputas d join transacciones t on t.id=d.transaccion_id
       join users v on v.id=t.vendedor_id join users c on c.id=t.comprador_id
      order by (d.estado='abierta') desc, d.created_at desc limit 50`);
  res.json({ disputas: rows });
});

// Resolver: 'reembolsar' (al comprador) o 'pagar' (libera al vendedor).
r.post('/disputas/:id/resolver', async (req, res) => {
  const p = z.object({ accion: z.enum(['reembolsar', 'pagar']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Acción inválida' });
  const { rows } = await query("select transaccion_id from disputas where id=$1 and estado='abierta'", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Disputa no encontrada o ya resuelta' });
  const t = p.data.accion === 'reembolsar' ? await reembolsar(rows[0].transaccion_id) : await liberarAlVendedor(rows[0].transaccion_id);
  t ? res.json({ ok: true }) : res.status(409).json({ error: 'La transacción ya no está en disputa' });
});

export default r;
