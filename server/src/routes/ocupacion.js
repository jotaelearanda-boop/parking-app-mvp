// "Tengo plaza": la plaza que ocupa el usuario (comprada en la app o marcada a mano). No caduca; termina cuando la vende
// o dice que ya no la tiene. Mientras existe, se le recuerda cada pocas horas que puede venderla.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

const SEL = `select id, origen, desde, ST_Y(geo::geometry) as lat, ST_X(geo::geometry) as lng from ocupaciones`;

r.get('/', async (req, res) => {
  const { rows } = await query(`${SEL} where user_id=$1 and activa`, [req.user.id]);
  res.json({ ocupacion: rows[0] ?? null });
});

r.post('/', async (req, res) => {
  const p = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Ubicación no válida' });
  const punto = 'ST_SetSRID(ST_MakePoint($3,$2),4326)::geography';
  const upd = await query(`update ocupaciones set geo=${punto}, origen='manual' where user_id=$1 and activa returning id`, [req.user.id, p.data.lat, p.data.lng]);
  if (!upd.rowCount) await query(`insert into ocupaciones(user_id, geo, origen) values ($1, ${punto}, 'manual')`, [req.user.id, p.data.lat, p.data.lng]);
  evento('ocupacion_marcada', { userId: req.user.id, ip: req.ip });
  const { rows } = await query(`${SEL} where user_id=$1 and activa`, [req.user.id]);
  res.status(201).json({ ocupacion: rows[0] });
});

// "Ya no tengo plaza": termina la ocupación y borra su ubicación.
r.delete('/', async (req, res) => {
  await query(`update ocupaciones set activa=false, geo=null, terminada_at=now() where user_id=$1 and activa`, [req.user.id]);
  evento('ocupacion_terminada', { userId: req.user.id, ip: req.ip });
  res.status(204).end();
});

export default r;
