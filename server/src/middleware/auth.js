import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: '7d' });

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret).sub;
}

// Exige JWT válido y usuario no suspendido.
export async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const id = verifyToken(token);
    const { rows } = await query('select * from users where id=$1', [id]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Usuario no existe' });
    if (u.suspended_until && new Date(u.suspended_until) > new Date())
      return res.status(403).json({ error: 'Cuenta suspendida temporalmente' });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'No autenticado' });
  }
}

export const requireAdmin = (req, res, next) =>
  req.user?.is_admin ? next() : res.status(403).json({ error: 'Solo admin' });
