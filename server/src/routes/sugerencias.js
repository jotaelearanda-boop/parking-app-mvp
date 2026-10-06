// Sugerencias, errores y mejoras del usuario (con respuestas del equipo desde el backoffice).
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { evento } from '../config/audit.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

const texto = z.string().trim().min(5, 'Cuéntanos un poco más (mínimo 5 caracteres)').max(2000, 'Máximo 2.000 caracteres');

r.get('/', async (req, res) => {
  const { rows } = await query(
    `select s.id, s.tipo, s.estado, s.created_at, s.updated_at,
            (select texto from sugerencias_mensajes m where m.sugerencia_id=s.id order by id limit 1) as texto,
            (select count(*)::int from sugerencias_mensajes m where m.sugerencia_id=s.id and m.autor='equipo' and not m.leido_usuario) as sin_leer
       from sugerencias s where s.user_id=$1 order by s.updated_at desc limit 50`, [req.user.id]);
  res.json({ sugerencias: rows });
});

r.post('/', async (req, res) => {
  const p = z.object({ tipo: z.enum(['sugerencia', 'error', 'mejora']), texto, pantalla: z.string().max(100).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { rows: n } = await query(`select count(*)::int n from sugerencias where user_id=$1 and created_at > now() - interval '1 hour'`, [req.user.id]);
  if (n[0].n >= 5) return res.status(429).json({ error: 'Has enviado varios mensajes seguidos: espera un rato antes de enviar otro' });
  const contexto = { navegador: String(req.headers['user-agent'] ?? '').slice(0, 200), pantalla: p.data.pantalla ?? null };
  const { rows } = await query('insert into sugerencias(user_id, tipo, contexto) values ($1,$2,$3) returning id, tipo, estado, created_at, updated_at', [req.user.id, p.data.tipo, contexto]);
  await query("insert into sugerencias_mensajes(sugerencia_id, autor, texto) values ($1,'usuario',$2)", [rows[0].id, p.data.texto]);
  evento('sugerencia_creada', { userId: req.user.id, ip: req.ip, data: { id: rows[0].id, tipo: p.data.tipo } });
  res.status(201).json({ sugerencia: { ...rows[0], texto: p.data.texto, sin_leer: 0 } });
});

r.get('/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Id no válido' });
  const { rows } = await query('select id, tipo, estado, created_at from sugerencias where id=$1 and user_id=$2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  const { rows: m } = await query('select id, autor, texto, created_at from sugerencias_mensajes where sugerencia_id=$1 order by id', [req.params.id]);
  await query("update sugerencias_mensajes set leido_usuario=true where sugerencia_id=$1 and autor='equipo' and not leido_usuario", [req.params.id]);
  res.json({ sugerencia: rows[0], mensajes: m });
});

r.post('/:id/mensaje', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Id no válido' });
  const p = z.object({ texto }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const up = await query(
    `update sugerencias set estado = case when estado='respondida' then 'abierta' else estado end, updated_at=now()
      where id=$1 and user_id=$2 and estado <> 'cerrada' returning id`, [req.params.id, req.user.id]);
  if (!up.rowCount) return res.status(409).json({ error: 'Este mensaje está cerrado: envía uno nuevo' });
  const { rows } = await query("insert into sugerencias_mensajes(sugerencia_id, autor, texto) values ($1,'usuario',$2) returning id, autor, texto, created_at", [req.params.id, p.data.texto]);
  res.status(201).json({ mensaje: rows[0] });
});

export default r;
