// Login propio del backoffice. Solo personal; cada intento (bueno o malo) queda registrado.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../config/db.js';
import { evento } from '../config/audit.js';
import { permisosDe, signBackofficeToken } from '../middleware/staff.js';

const r = Router();
r.use(rateLimit({ windowMs: 15 * 60_000, limit: 15, message: { error: 'Demasiados intentos. Espera unos minutos.' } }));

r.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  const { rows } = await query('select * from users where email=$1', [email]);
  const u = rows[0];
  const ok = u && ['gestor', 'superadmin'].includes(u.rol) && (await bcrypt.compare(String(req.body?.password ?? ''), u.password_hash));
  await evento(ok ? 'bo_login_ok' : 'bo_login_fail', { userId: u?.id ?? null, ip: req.ip, data: { email, motivo: ok ? null : (!u ? 'no_existe' : !['gestor', 'superadmin'].includes(u.rol) ? 'sin_rol' : 'password') } });
  if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas o sin acceso' });
  res.json({ token: signBackofficeToken(u), usuario: { id: u.id, name: u.name, email: u.email, rol: u.rol, permisos: permisosDe(u.rol) } });
});

export default r;
