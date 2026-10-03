import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { avisarMatches } from '../config/match.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

const crearSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  precio_cents: z.coerce.number().int().min(50).max(2000).default(150),
  vehiculo_id: z.string().uuid().optional(),
});

// Vendedor publica su plaza. Necesita tener su coche registrado (el comprador lo verá tras pagar).
r.post('/', requireAuth, async (req, res) => {
  const p = crearSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { lat, lng, precio_cents } = p.data;
  // Coche con el que se vende: el elegido o, si no, el principal.
  const { rows: vh } = await query(
    `select id from vehiculos where user_id=$1 and borrado_at is null and ($2::uuid is null or id=$2) order by principal desc limit 1`, [req.user.id, p.data.vehiculo_id ?? null]);
  if (!vh[0]) return res.status(409).json({ error: 'Añade los datos de tu coche antes de vender', codigo: 'falta_vehiculo' });
  if (env.zona.estricta) {
    const { rows: z } = await query(
      'select ST_DWithin(ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, ST_SetSRID(ST_MakePoint($4,$3),4326)::geography, $5) as dentro',
      [lat, lng, env.zona.lat, env.zona.lng, env.zona.radioM]);
    if (!z[0].dentro) return res.status(422).json({ error: 'Estás fuera de la zona piloto (Benalúa)' });
  }
  const { rows: zb } = await query(
    `select nombre, tipo from zonas_bloqueadas where activa and ST_Intersects(geom, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) limit 1`, [lat, lng]);
  if (zb[0]) return res.status(422).json({ error: `Esta calle está en zona regulada (${zb[0].tipo}: ${zb[0].nombre}). Aquí no se pueden vender plazas.`, codigo: 'zona_bloqueada' });
  const activa = await query(
    `select 1 from plazas_activas where seller_id=$1 and estado in ('disponible','reservada')`, [req.user.id]);
  if (activa.rowCount) return res.status(409).json({ error: 'Ya tienes una plaza activa' });
  const { rows } = await query(
    `insert into plazas_activas(seller_id, geo, precio_cents, vehiculo_id)
     values ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4, $5)
     returning id, estado`,
    [req.user.id, lat, lng, precio_cents, vh[0].id]);
  avisarMatches(rows[0].id, lat, lng, req.user.id).catch((e) => console.error('match', e.message));   // push a quien busca plaza cerca
  res.status(201).json(rows[0]);
});

const buscarSchema = z.object({
  lat: z.coerce.number(), lng: z.coerce.number(),
  radio: z.coerce.number().min(50).max(5000).default(1000),   // metros
  precio_max: z.coerce.number().int().optional(),             // céntimos
});

// Comprador: plazas cercanas. NO expone ubicación exacta hasta pagar: se redondea ~100 m.
r.get('/cerca', requireAuth, async (req, res) => {
  const p = buscarSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { lat, lng, radio, precio_max } = p.data;
  const { rows } = await query(
    `select p.id, p.precio_cents,
            round(ST_Distance(p.geo, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography))::int as distancia_m,
            round(ST_Y(p.geo::geometry)::numeric, 3) as lat_aprox,
            round(ST_X(p.geo::geometry)::numeric, 3) as lng_aprox,
            u.name as vendedor, u.rating_avg, u.rating_count
       from plazas_activas p join users u on u.id = p.seller_id
      where p.estado='disponible'
        and ST_DWithin(p.geo, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
        and ($4::int is null or p.precio_cents <= $4)
        and p.seller_id <> $5
      order by distancia_m limit 100`,
    [lat, lng, radio, precio_max ?? null, req.user.id]);
  res.json({ plazas: rows });
});

// Zonas bloqueadas (azul/naranja) como GeoJSON, para pintarlas en el mapa.
r.get('/zonas', requireAuth, async (_q, res) => {
  const { rows } = await query(
    `select id, nombre, tipo, ST_AsGeoJSON(geom::geometry)::json as geometry from zonas_bloqueadas where activa`);
  res.json({ type: 'FeatureCollection', features: rows.map((z) => ({ type: 'Feature', properties: { id: z.id, nombre: z.nombre, tipo: z.tipo }, geometry: z.geometry })) });
});

// Mi plaza activa (para la pantalla "Mi coche"). Es mía, así que se devuelve la ubicación exacta.
r.get('/mia', requireAuth, async (req, res) => {
  const { rows } = await query(
    `select p.id, p.estado, p.precio_cents, p.created_at,
            ST_Y(p.geo::geometry) as lat, ST_X(p.geo::geometry) as lng,
            (select t.id from transacciones t where t.plaza_id=p.id and t.estado in ('pendiente_pago','en_escrow','disputada') limit 1) as transaccion_id
       from plazas_activas p where p.seller_id=$1 and p.estado in ('disponible','reservada')
      order by p.created_at desc limit 1`, [req.user.id]);
  res.json({ plaza: rows[0] ?? null });
});

// Una plaza concreta (para abrir el aviso de un push). Ubicación aproximada, como en la búsqueda.
r.get('/:id', requireAuth, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Id no válido' });
  const { rows } = await query(
    `select p.id, p.precio_cents, p.estado, round(ST_Y(p.geo::geometry)::numeric, 3) as lat_aprox, round(ST_X(p.geo::geometry)::numeric, 3) as lng_aprox,
            u.name as vendedor, u.rating_avg, u.rating_count
       from plazas_activas p join users u on u.id=p.seller_id where p.id=$1 and p.estado='disponible' and p.seller_id <> $2`, [req.params.id, req.user.id]);
  rows[0] ? res.json({ plaza: rows[0] }) : res.status(404).json({ error: 'Esa plaza ya no está disponible' });
});

// Vendedor cancela su plaza (solo si no está reservada).
r.delete('/:id', requireAuth, async (req, res) => {
  const { rowCount } = await query(
    `update plazas_activas set estado='cancelada', cerrada_at=now() where id=$1 and seller_id=$2 and estado='disponible'`,
    [req.params.id, req.user.id]);
  rowCount ? res.status(204).end() : res.status(409).json({ error: 'No se puede cancelar' });
});

export default r;
