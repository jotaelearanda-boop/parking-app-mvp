// Modo "Busco plaza": el comprador deja una zona y un radio durante 3 horas; si alguien publica una plaza ahí, recibe un push.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

r.get('/', async (req, res) => {
  const { rows } = await query('select hasta, radio_m from busquedas_activas where user_id=$1 and hasta > now()', [req.user.id]);
  res.json({ busqueda: rows[0] ?? null });
});

r.put('/', async (req, res) => {
  const p = z.object({
    lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
    radio_m: z.coerce.number().int().min(100).max(2000).default(600),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos no válidos' });
  const { rows } = await query(
    `insert into busquedas_activas(user_id, geo, radio_m, hasta) values ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4, now() + interval '3 hours')
     on conflict (user_id) do update set geo=excluded.geo, radio_m=excluded.radio_m, hasta=excluded.hasta, ultimo_match_at=null
     returning hasta, radio_m`, [req.user.id, p.data.lat, p.data.lng, p.data.radio_m]);
  evento('busco_plaza', { userId: req.user.id, ip: req.ip, data: { radio_m: p.data.radio_m } });
  res.json({ busqueda: rows[0] });
});

r.delete('/', async (req, res) => {
  await query('delete from busquedas_activas where user_id=$1', [req.user.id]);
  res.status(204).end();
});

export default r;
