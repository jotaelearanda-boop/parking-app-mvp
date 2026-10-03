import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { z } from 'zod';
import { query } from '../config/db.js';
import { evento } from '../config/audit.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const r = Router();
const publico = ({ password_hash, stripe_account_id, google_sub, ...u }) => ({ ...u, politicas_ok: u.consent_version === POLITICAS_VERSION, google_vinculada: !!google_sub });

// Matrícula: se normaliza a mayúsculas sin espacios/guiones (cubre formato nuevo 1234BCD, antiguo A1234BC y extranjeras).
const vehiculoSchema = z.object({
  vehiculo_modelo: z.string().trim().min(2, 'Indica el modelo').max(40),
  vehiculo_color: z.string().trim().min(3, 'Indica el color').max(20),
  vehiculo_matricula: z.string().trim().transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
    .refine((v) => /^[A-Z0-9]{4,10}$/.test(v), 'Matrícula no válida'),
});

export const POLITICAS_VERSION = '2026-10-beta-3';

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
    await query('insert into vehiculos(user_id, modelo, color, matricula, principal) values ($1,$2,$3,$4,true)',
      [rows[0].id, vehiculo_modelo, vehiculo_color, vehiculo_matricula]);
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

// Datos personales. Cambiar el email o la contraseña exige la contraseña actual.
// --- Acceso con Google ---------------------------------------------------------------------------
// 1) /google recibe el token de Google. Si el email ya tiene cuenta, entra; si no, devuelve un token corto
//    para completar el registro (teléfono, coche y aceptación de términos) en /google/registro.
const googleClient = new OAuth2Client();
r.get('/google/config', (_q, res) => res.json({ clientId: env.googleClientId || null }));

r.post('/google', async (req, res) => {
  if (!env.googleClientId) return res.status(503).json({ error: 'El acceso con Google aún no está disponible' });
  let g;
  try {
    const t = await googleClient.verifyIdToken({ idToken: String(req.body?.credential ?? ''), audience: env.googleClientId });
    g = t.getPayload();
  } catch { return res.status(401).json({ error: 'No pudimos verificar tu cuenta de Google' }); }
  if (!g?.email || !g.email_verified) return res.status(401).json({ error: 'Tu email de Google no está verificado' });
  const email = g.email.toLowerCase();
  const { rows } = await query('select * from users where google_sub=$1 or email=$2', [g.sub, email]);
  const u = rows.find((x) => x.google_sub === g.sub) ?? rows[0];
  if (u) {
    if (u.google_sub && u.google_sub !== g.sub) return res.status(409).json({ error: 'Ese email está vinculado a otra cuenta de Google' });
    // Si la cuenta se creó con contraseña y su email nunca se verificó, pudo registrarla otra persona: al vincularla con Google
    // se invalida esa contraseña (quien tiene el email verificado por Google es el dueño real).
    const resetPass = !u.google_sub && !u.email_verified;
    const hash = resetPass ? await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10) : null;
    const { rows: up } = await query(
      `update users set google_sub=$2, email_verified=true,
         password_hash = coalesce($3, password_hash), sin_password = sin_password or $3::text is not null where id=$1 returning *`, [u.id, g.sub, hash]);
    evento('login_google', { userId: u.id, ip: req.ip, data: { vinculada: !u.google_sub, password_invalidada: resetPass } });
    return res.json({ token: signToken(up[0]), user: publico(up[0]) });
  }
  const registro = jwt.sign({ g: g.sub, email, name: g.name ?? '' }, env.jwtSecret, { expiresIn: '30m', audience: 'google-signup' });
  res.json({ registro_pendiente: true, token_registro: registro, email, name: g.name ?? '' });
});

const googleRegistroSchema = vehiculoSchema.extend({
  token_registro: z.string(),
  acepta_politicas: z.literal(true, { error: 'Debes aceptar los términos y la política de privacidad' }),
  phone: z.string().regex(/^\+?[0-9 ]{9,15}$/, 'Teléfono inválido'),
  name: z.string().trim().min(2).max(60),
});

r.post('/google/registro', async (req, res) => {
  const p = googleRegistroSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  let t;
  try { t = jwt.verify(p.data.token_registro, env.jwtSecret, { audience: 'google-signup' }); }
  catch { return res.status(401).json({ error: 'La sesión de registro caducó: vuelve a pulsar «Continuar con Google»' }); }
  const d = p.data;
  try {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);   // sin contraseña usable hasta que la defina
    const { rows } = await query(
      `insert into users(email, phone, name, password_hash, vehiculo_modelo, vehiculo_color, vehiculo_matricula, consent_at, consent_version, google_sub, sin_password, email_verified)
       values ($1,$2,$3,$4,$5,$6,$7, now(), $8, $9, true, true) returning *`,
      [t.email, d.phone, d.name, hash, d.vehiculo_modelo, d.vehiculo_color, d.vehiculo_matricula, POLITICAS_VERSION, t.g]);
    await query('insert into vehiculos(user_id, modelo, color, matricula, principal) values ($1,$2,$3,$4,true)',
      [rows[0].id, d.vehiculo_modelo, d.vehiculo_color, d.vehiculo_matricula]);
    evento('registro', { userId: rows[0].id, ip: req.ip, data: { politicas: POLITICAS_VERSION, via: 'google' } });
    res.status(201).json({ token: signToken(rows[0]), user: publico(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese email o esa cuenta de Google: entra con Google' });
    throw e;
  }
});

r.put('/perfil', requireAuth, async (req, res) => {
  const p = z.object({
    name: z.string().trim().min(2).max(60),
    email: z.string().trim().email(),
    phone: z.string().regex(/^\+?[0-9 ]{9,15}$/, 'Teléfono inválido'),
    password_actual: z.string().max(100).optional(),
    password_nueva: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres').max(100).optional(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data, u = req.user, email = d.email.toLowerCase();
  const cambiaEmail = email !== u.email, cambiaPass = !!d.password_nueva;
  if (u.google_sub && cambiaEmail) return res.status(409).json({ error: 'El email de una cuenta de Google no se puede cambiar' });
  if ((cambiaEmail || cambiaPass) && !u.sin_password) {
    const { rows } = await query('select password_hash from users where id=$1', [u.id]);
    if (!d.password_actual || !(await bcrypt.compare(d.password_actual, rows[0].password_hash)))
      return res.status(403).json({ error: 'Para cambiar el email o la contraseña indica tu contraseña actual' });
  }
  try {
    const { rows } = await query(
      `update users set name=$2, email=$3, phone=$4,
         email_verified = case when $3 <> email then false else email_verified end,
         phone_verified = case when $4 <> phone then false else phone_verified end,
         password_hash = coalesce($5, password_hash),
         sin_password = case when $5::text is not null then false else sin_password end
       where id=$1 returning *`,
      [u.id, d.name, email, d.phone, cambiaPass ? await bcrypt.hash(d.password_nueva, 10) : null]);
    evento('perfil_editado', { userId: u.id, ip: req.ip, data: { email: cambiaEmail, telefono: d.phone !== u.phone, password: cambiaPass } });
    res.json({ user: publico(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese email ya está registrado' });
    throw e;
  }
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
