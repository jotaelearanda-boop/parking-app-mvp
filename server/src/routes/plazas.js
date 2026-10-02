import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

const crearSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  tiempo_min: z.coerce.number().refine(v => [30, 60, 120, 240].includes(v)),
  precio_cents: z.coerce.number().int().min(50).max(2000).default(150),
});

// Vendedor publica su plaza. Necesita tener su coche registrado (el comprador lo verá tras pagar).
r.post('/', requireAuth, async (req, res) => {
  if (!req.user.vehiculo_matricula) return res.status(409).json({ error: 'Añade los datos de tu coche antes de vender', codigo: 'falta_vehiculo' });
  const p = crearSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { lat, lng, tiempo_min, precio_cents } = p.data;
  if (env.zona.estricta) {
    const { rows: z } = await query(
      'select ST_DWithin(ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, ST_SetSRID(ST_MakePoint($4,$3),4326)::geography, $5) as dentro',
      [lat, lng, env.zona.lat, env.zona.lng, env.zona.radioM]);
    if (!z[0].dentro) return res.status(422).json({ error: 'Estás fuera de la zona piloto (Benalúa: Aloná y García Andreu)' });
  }
  const activa = await query(
    `select 1 from plazas_activas where seller_id=$1 and estado in ('disponible','reservada')`, [req.user.id]);
  if (activa.rowCount) return res.status(409).json({ error: 'Ya tienes una plaza activa' });
  const { rows } = await query(
    `insert into plazas_activas(seller_id, geo, tiempo_min, precio_cents, expira_at)
     values ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4, $5, now() + make_interval(mins => $4))
     returning id, estado, expira_at`,
    [req.user.id, lat, lng, tiempo_min, precio_cents]);
  res.status(201).json(rows[0]);
});

const buscarSchema = z.object({
  lat: z.coerce.number(), lng: z.coerce.number(),
  radio: z.coerce.number().min(50).max(5000).default(1000),   // metros
  precio_max: z.coerce.number().int().optional(),             // céntimos
  min_restante: z.coerce.number().int().default(0),           // minutos
});

// Comprador: plazas cercanas. NO expone ubicación exacta hasta pagar: se redondea ~100 m.
r.get('/cerca', requireAuth, async (req, res) => {
  const p = buscarSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { lat, lng, radio, precio_max, min_restante } = p.data;
  const { rows } = await query(
    `select p.id, p.precio_cents, p.tiempo_min,
            round(extract(epoch from (p.expira_at - now()))/60)::int as minutos_restantes,
            round(ST_Distance(p.geo, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography))::int as distancia_m,
            round(ST_Y(p.geo::geometry)::numeric, 3) as lat_aprox,
            round(ST_X(p.geo::geometry)::numeric, 3) as lng_aprox,
            u.name as vendedor, u.rating_avg, u.rating_count
       from plazas_activas p join users u on u.id = p.seller_id
      where p.estado='disponible' and p.expira_at > now() + make_interval(mins => $5)
        and ST_DWithin(p.geo, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
        and ($4::int is null or p.precio_cents <= $4)
      order by distancia_m limit 100`,
    [lat, lng, radio, precio_max ?? null, min_restante]);
  res.json({ plazas: rows });
});

// Vendedor cancela su plaza (solo si no está reservada).
r.delete('/:id', requireAuth, async (req, res) => {
  const { rowCount } = await query(
    `update plazas_activas set estado='cancelada' where id=$1 and seller_id=$2 and estado='disponible'`,
    [req.params.id, req.user.id]);
  rowCount ? res.status(204).end() : res.status(409).json({ error: 'No se puede cancelar' });
});

export default r;
