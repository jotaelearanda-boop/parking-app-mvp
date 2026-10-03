import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { push as cfg } from '../config/env.js';
import { enviarPush, pushDisponible } from '../config/push.js';
import { requireAuth } from '../middleware/auth.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireAuth);

r.get('/clave', (_q, res) => res.json({ disponible: pushDisponible, publicKey: cfg.publicKey ?? null }));

const subSchema = z.object({ subscription: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) });

r.post('/suscribir', async (req, res) => {
  const p = subSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Suscripción no válida' });
  const { endpoint, keys } = p.data.subscription;
  await query(
    `insert into push_subs(user_id, endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent`,
    [req.user.id, endpoint, keys.p256dh, keys.auth, String(req.headers['user-agent'] ?? '').slice(0, 200)]);
  evento('push_activado', { userId: req.user.id, ip: req.ip });
  res.status(201).json({ ok: true });
});

r.post('/baja', async (req, res) => {
  await query('delete from push_subs where user_id=$1 and endpoint=$2', [req.user.id, String(req.body?.endpoint ?? '')]);
  res.json({ ok: true });
});

r.get('/estado', async (req, res) => {
  const { rows } = await query('select count(*)::int n from push_subs where user_id=$1', [req.user.id]);
  res.json({ dispositivos: rows[0].n, disponible: pushDisponible });
});

r.post('/prueba', async (req, res) => {
  const n = await enviarPush(req.user.id, { titulo: 'Avisos activados ✅', cuerpo: 'Así te avisaremos cuando haya novedades.', url: '/', tag: 'prueba' });
  n ? res.json({ enviados: n }) : res.status(409).json({ error: 'No hay ningún dispositivo con avisos activados' });
});

export default r;
