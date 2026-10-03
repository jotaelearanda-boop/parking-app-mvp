// Tareas periódicas (cada minuto). Aptas para una sola instancia de servidor en el MVP.
import { query } from './config/db.js';
import { reembolsar } from './config/liquidar.js';
import { evento } from './config/audit.js';

async function tick() {
  // 1. Reservas sin pagar tras 10 min: se cancelan y la plaza vuelve a estar disponible (si no ha caducado).
  const { rows: viejas } = await query(
    `update transacciones set estado='cancelada' where estado='pendiente_pago' and created_at < now() - interval '10 minutes' returning plaza_id`);
  for (const v of viejas) await query("update plazas_activas set estado='disponible' where id=$1 and estado='reservada'", [v.plaza_id]);

  // 2. Disputas abiertas más de 24 h sin resolver: reembolso automático.
  const { rows: disp } = await query(
    "select transaccion_id from disputas where estado='abierta' and created_at < now() - interval '24 hours'");
  for (const d of disp) { await reembolsar(d.transaccion_id); evento('reembolso_automatico_24h', { data: { transaccion: d.transaccion_id } }); }

  // 3. RGPD: borrar ubicación 1 h después de cerrar (o 1 h tras cancelarse si nunca hubo compra).
  const { rows: cand } = await query(
    `select p.id from plazas_activas p
      where p.purgada_at is null and p.estado in ('completada','cancelada','expirada') and (
        exists (select 1 from transacciones t where t.plaza_id=p.id and t.location_purge_at < now())
        or (not exists (select 1 from transacciones t where t.plaza_id=p.id) and p.cerrada_at < now() - interval '1 hour'))`);
  for (const c of cand) {
    await query('update plazas_activas set geo=null, purgada_at=now() where id=$1', [c.id]);
  }
}

export function iniciarJobs() {
  const run = () => tick().catch((e) => console.error('job error', e));
  setInterval(run, 60_000);
  run();
}
