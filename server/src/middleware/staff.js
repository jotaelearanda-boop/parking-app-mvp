// Acceso al backoffice: solo personal (gestor/superadmin) y con un token propio del backoffice.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

export const signBackofficeToken = (user) => jwt.sign({ sub: user.id, rol: user.rol }, env.jwtSecret, { audience: 'backoffice', expiresIn: '8h' });

// Qué puede hacer cada rol.
const PERMISOS = {
  superadmin: ['ver', 'reclamaciones', 'sugerencias', 'suspender', 'ajuste_saldo', 'zonas', 'auditoria', 'equipo', 'retiradas'],
  gestor: ['ver', 'reclamaciones', 'sugerencias', 'suspender'],
};

export async function requireStaff(req, res, next) {
  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const { sub } = jwt.verify(token, env.jwtSecret, { audience: 'backoffice' });   // un token de la app móvil NO vale
    const { rows } = await query('select * from users where id=$1', [sub]);
    const u = rows[0];
    if (!u || !PERMISOS[u.rol]) return res.status(403).json({ error: 'Sin acceso al backoffice' });
    if (u.suspended_until && new Date(u.suspended_until) > new Date()) return res.status(403).json({ error: 'Cuenta suspendida' });
    req.user = u;
    req.permisos = PERMISOS[u.rol];
    next();
  } catch { res.status(401).json({ error: 'Sesión del backoffice no válida o caducada' }); }
}

export const permiso = (p) => (req, res, next) =>
  req.permisos?.includes(p) ? next() : res.status(403).json({ error: `Tu rol (${req.user.rol}) no puede hacer esto` });

export const permisosDe = (rol) => PERMISOS[rol] ?? [];
