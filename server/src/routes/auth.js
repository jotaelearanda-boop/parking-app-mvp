import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const r = Router();
const publico = ({ password_hash, stripe_account_id, ...u }) => u;

const registroSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9 ]{9,15}$/, 'Teléfono inválido'),
  name: z.string().min(2).max(60),
  password: z.string().min(8).max(100),
});

r.post('/registro', async (req, res) => {
  const p = registroSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { email, phone, name, password } = p.data;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `insert into users(email, phone, name, password_hash) values (lower($1),$2,$3,$4) returning *`,
      [email, phone, name, hash]);
    // TODO semana 3: enviar código de verificación por email/SMS (proveedor por decidir)
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
  if (!u || !(await bcrypt.compare(String(password ?? ''), u.password_hash)))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  res.json({ token: signToken(u), user: publico(u) });
});

r.get('/yo', requireAuth, (req, res) => res.json({ user: publico(req.user) }));

export default r;
