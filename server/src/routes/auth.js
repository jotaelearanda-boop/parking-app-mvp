import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { evento } from '../config/audit.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const r = Router();
const publico = ({ password_hash, stripe_account_id, ...u }) => ({ ...u, politicas_ok: u.consent_version === POLITICAS_VERSION });

// Matrícula: se normaliza a mayúsculas sin espacios/guiones (cubre formato nuevo 1234BCD, antiguo A1234BC y extranjeras).
const vehiculoSchema = z.object({
  vehiculo_modelo: z.string().trim().min(2, 'Indica el modelo').max(40),
  vehiculo_color: z.string().trim().min(3, 'Indica el color').max(20),
  vehiculo_matricula: z.string().trim().transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
    .refine((v) => /^[A-Z0-9]{4,10}$/.test(v), 'Matrícula no válida'),
});

export const POLITICAS_VERSION = '2026-10-beta';

const registroSchema = vehiculoSchema.extend({
  acepta_politicas: z.literal(true, { error: 'Debes aceptar los términos y la política de privacidad' }),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9 ]{9,15}$/, 'Teléfono inválido'),
  name: z.string().min(2).max(60),
  password: z.string().min(8).max(100),
});

r.post('/registro', async (req, res) => {
  const p = registroSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { email, phone, name, password, vehiculo_modelo, vehiculo_color, vehiculo_matricula } = p.data;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `insert into users(email, phone, name, password_hash, vehiculo_modelo, vehiculo_color, vehiculo_matricula, consent_at, consent_version)
       values (lower($1),$2,$3,$4,$5,$6,$7, now(), $8) returning *`,
      [email, phone, name, hash, vehiculo_modelo, vehiculo_color, vehiculo_matricula, POLITICAS_VERSION]);
    // TODO semana 3: enviar código de verificación por email/SMS (proveedor por decidir)
    evento('registro', { userId: rows[0].id, ip: req.ip, data: { politicas: POLITICAS_VERSION } });
    res.status(201).json({ token: signToken(rows[0]), user: publico(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email ya registrado' });
    throw e;
  }
});

r.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await query('select * from users where email=lower($1)', [String(email ?? '')]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(String(password ?? ''), u.password_hash))) {
    evento('login_fail', { userId: u?.id ?? null, ip: req.ip, data: { email: String(email ?? '').toLowerCase() } });
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  evento('login_ok', { userId: u.id, ip: req.ip });
  res.json({ token: signToken(u), user: publico(u) });
});

r.put('/vehiculo', requireAuth, async (req, res) => {
  const p = vehiculoSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { rows } = await query(
    'update users set vehiculo_modelo=$1, vehiculo_color=$2, vehiculo_matricula=$3 where id=$4 returning *',
    [p.data.vehiculo_modelo, p.data.vehiculo_color, p.data.vehiculo_matricula, req.user.id]);
  res.json({ user: publico(rows[0]) });
});

// Usuarios anteriores a las políticas (o con una versión antigua) aceptan aquí.
r.post('/consentimiento', requireAuth, async (req, res) => {
  if (req.body?.acepta_politicas !== true) return res.status(400).json({ error: 'Debes aceptar para continuar' });
  const { rows } = await query('update users set consent_at=now(), consent_version=$1 where id=$2 returning *', [POLITICAS_VERSION, req.user.id]);
  evento('consentimiento', { userId: req.user.id, ip: req.ip, data: { version: POLITICAS_VERSION } });
  res.json({ user: publico(rows[0]) });
});

r.get('/yo', requireAuth, (req, res) => res.json({ user: publico(req.user) }));

export default r;
