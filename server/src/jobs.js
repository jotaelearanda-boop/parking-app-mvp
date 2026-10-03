// Tareas periódicas (cada minuto). Aptas para una sola instancia de servidor en el MVP.
import { query } from './config/db.js';
import { reembolsar } from './config/liquidar.js';
import { evento } from './config/audit.js';
import { enviarPush } from './config/push.js';
import { push as pushCfg } from './config/env.js';

async function tick() {
  // 1. Reservas sin pagar tras 10 min: se cancelan y la plaza vuelve a estar disponible (si no ha caducado).
  const { rows: viejas } = await query(
    `update transacciones set estado='cancelada' where estado='pendiente_pago' and created_at < now() - interval '10 minutes' returning plaza_id`);
  for (const v of viejas) await query("update plazas_activas set estado='disponible' where id=$1 and estado='reservada'", [v.plaza_id]);

  // 2. Disputas abiertas más de 24 h sin resolver: reembolso automático.
  const { rows: disp } = await query(
    "select transaccion_id from disputas where estado='abierta' and created_at < now() - interval '24 hours'");
  for (const d of disp) { await reembolsar(d.transaccion_id); evento('reembolso_automatico_24h', { data: { transaccion: d.transaccion_id } }); }

  // 3. Recordatorio a quien ocupa una plaza sin venderla: a las 4 h de ocuparla y luego cada N horas, solo de 8:00 a 21:59 (Madrid).
  const { rows: ocupan } = await query(
    `select o.id, o.user_id from ocupaciones o
      where o.activa
        and ((o.ultimo_aviso_at is null and o.desde < now() - interval '4 hours') or o.ultimo_aviso_at < now() - $1 * interval '1 hour')
        and not exists (select 1 from plazas_activas p where p.seller_id = o.user_id and p.estado in ('disponible','reservada'))
        and extract(hour from (now() at time zone 'Europe/Madrid')) between 8 and 21`, [pushCfg.recordatorioHoras]);
  for (const o of ocupan) {
    const n = await enviarPush(o.user_id, { titulo: '¡No olvides vender tu plaza! 🚘', cuerpo: 'Cuando te vayas, publícala y alguien la aprovechará.', url: '/coche', tag: 'recordatorio' });
    if (n) { await query('update ocupaciones set ultimo_aviso_at=now() where id=$1', [o.id]); evento('recordatorio_vender', { userId: o.user_id }); }
  }
  await query('delete from busquedas_activas where hasta < now()');

  // 4. RGPD: borrar ubicación 1 h después de cerrar (o 1 h tras cancelarse si nunca hubo compra).
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
