// "Match": cuando alguien publica una plaza, se avisa a quien tiene activo "Busco plaza" a menos de su radio.
import { query } from './db.js';
import { notify } from '../ws.js';
import { evento } from './audit.js';

export async function avisarMatches(plazaId, lat, lng, vendedorId) {
  // Máximo un aviso cada 10 minutos por persona, para no saturar.
  const { rows } = await query(
    `update busquedas_activas b set ultimo_match_at = now()
      where b.hasta > now() and b.user_id <> $1
        and (b.ultimo_match_at is null or b.ultimo_match_at < now() - interval '10 minutes')
        and ST_DWithin(b.geo, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, b.radio_m)
      returning b.user_id, round(ST_Distance(b.geo, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography))::int as distancia_m`,
    [vendedorId, lat, lng]);
  for (const m of rows) {
    notify(m.user_id, 'match', { plaza_id: plazaId, distancia_m: m.distancia_m });
    evento('match', { userId: m.user_id, data: { plaza: plazaId, distancia_m: m.distancia_m } });
  }
  return rows.length;
}
