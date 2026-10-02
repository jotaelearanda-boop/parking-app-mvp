import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { vendedorListo } from './stripe.js';

const r = Router();

// Fotos en disco local para el MVP. TODO: pasar a Supabase Storage/S3 en deploy (Railway tiene disco efímero).
export const UPLOAD_DIR = path.resolve('uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_q, f, cb) => cb(null, randomUUID() + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_q, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
});

const crearSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  tiempo_min: z.coerce.number().refine(v => [30, 60, 120, 240].includes(v)),
  precio_cents: z.coerce.number().int().min(50).max(2000).default(150),
});

// Vendedor publica su plaza. La foto de matrícula es obligatoria.
r.post('/', requireAuth, upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Foto de matrícula obligatoria (jpg/png/webp, máx 5MB)' });
  const p = crearSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { lat, lng, tiempo_min, precio_cents } = p.data;
  if (!(await vendedorListo(req.user)))
    return res.status(402).json({ error: 'Completa tu cuenta de cobros (Stripe) para vender', codigo: 'stripe_onboarding' });
  const activa = await query(
    `select 1 from plazas_activas where seller_id=$1 and estado in ('disponible','reservada')`, [req.user.id]);
  if (activa.rowCount) return res.status(409).json({ error: 'Ya tienes una plaza activa' });
  const { rows } = await query(
    `insert into plazas_activas(seller_id, geo, tiempo_min, precio_cents, foto_matricula_url, expira_at)
     values ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4, $5, $6, now() + make_interval(mins => $4))
     returning id, estado, expira_at`,
    [req.user.id, lat, lng, tiempo_min, precio_cents, `/uploads/${req.file.filename}`]);
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
