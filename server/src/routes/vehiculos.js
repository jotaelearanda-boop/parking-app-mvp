// Coches del usuario (hasta 5). Uno es el principal; se elige coche al vender o reservar.
import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { evento } from '../config/audit.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);
const MAX = 5;

const schema = z.object({
  modelo: z.string().trim().min(2, 'Indica el modelo').max(40),
  color: z.string().trim().min(3, 'Indica el color').max(20),
  matricula: z.string().trim().transform((v) => v.toUpperCase().replace(/[\s-]/g, '')).refine((v) => /^[A-Z0-9]{4,10}$/.test(v), 'Matrícula no válida'),
});

// Copia el coche principal a users.vehiculo_* (compatibilidad con el backoffice y búsquedas por matrícula).
export const sincronizarPrincipal = (db, userId) => db.query(
  `update users u set vehiculo_modelo=v.modelo, vehiculo_color=v.color, vehiculo_matricula=v.matricula
     from vehiculos v where v.user_id=u.id and v.principal and v.borrado_at is null and u.id=$1`, [userId]);

const lista = (userId) => query(
  'select id, modelo, color, matricula, principal from vehiculos where user_id=$1 and borrado_at is null order by principal desc, created_at', [userId]).then((x) => x.rows);

r.get('/', async (req, res) => res.json({ vehiculos: await lista(req.user.id) }));

const guardar = async (req, res, id) => {
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('select 1 from users where id=$1 for update', [req.user.id]);   // evita carreras al contar/designar principal
    let v;
    if (id) {
      v = (await c.query('update vehiculos set modelo=$3, color=$4, matricula=$5 where id=$1 and user_id=$2 and borrado_at is null returning *',
        [id, req.user.id, p.data.modelo, p.data.color, p.data.matricula])).rows[0];
      if (!v) { await c.query('rollback'); return res.status(404).json({ error: 'Coche no encontrado' }); }
    } else {
      const { rows: n } = await c.query('select count(*)::int n from vehiculos where user_id=$1 and borrado_at is null', [req.user.id]);
      if (n[0].n >= MAX) { await c.query('rollback'); return res.status(409).json({ error: `Máximo ${MAX} coches` }); }
      v = (await c.query('insert into vehiculos(user_id, modelo, color, matricula, principal) values ($1,$2,$3,$4,$5) returning *',
        [req.user.id, p.data.modelo, p.data.color, p.data.matricula, n[0].n === 0])).rows[0];
    }
    await sincronizarPrincipal(c, req.user.id);
    await c.query('commit');
    evento(id ? 'coche_editado' : 'coche_anadido', { userId: req.user.id, ip: req.ip, data: { vehiculo: v.id } });
    res.status(id ? 200 : 201).json({ vehiculos: await lista(req.user.id) });
  } catch (e) {
    await c.query('rollback');
    if (e.code === '23505') return res.status(409).json({ error: 'Ya tienes un coche con esa matrícula' });
    throw e;
  } finally { c.release(); }
};

r.post('/', (req, res) => guardar(req, res, null));
r.put('/:id', (req, res) => guardar(req, res, req.params.id));

r.post('/:id/principal', async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows } = await c.query('select id from vehiculos where id=$1 and user_id=$2 and borrado_at is null', [req.params.id, req.user.id]);
    if (!rows[0]) { await c.query('rollback'); return res.status(404).json({ error: 'Coche no encontrado' }); }
    await c.query('update vehiculos set principal=false where user_id=$1 and principal', [req.user.id]);
    await c.query('update vehiculos set principal=true where id=$1', [req.params.id]);
    await sincronizarPrincipal(c, req.user.id);
    await c.query('commit');
    res.json({ vehiculos: await lista(req.user.id) });
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
});

r.delete('/:id', async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('select 1 from users where id=$1 for update', [req.user.id]);
    const { rows } = await c.query('select id, principal from vehiculos where id=$1 and user_id=$2 and borrado_at is null', [req.params.id, req.user.id]);
    if (!rows[0]) { await c.query('rollback'); return res.status(404).json({ error: 'Coche no encontrado' }); }
    const { rows: n } = await c.query('select count(*)::int n from vehiculos where user_id=$1 and borrado_at is null', [req.user.id]);
    if (n[0].n <= 1) { await c.query('rollback'); return res.status(409).json({ error: 'Debes conservar al menos un coche' }); }
    const { rows: uso } = await c.query(
      `select 1 from plazas_activas where vehiculo_id=$1 and estado in ('disponible','reservada')
       union all select 1 from transacciones where $1 in (comprador_vehiculo_id, (select vehiculo_id from plazas_activas where id=plaza_id)) and estado in ('pendiente_pago','en_escrow','disputada') limit 1`, [req.params.id]);
    if (uso[0]) { await c.query('rollback'); return res.status(409).json({ error: 'Ese coche está en una plaza o reserva en curso' }); }
    await c.query('update vehiculos set borrado_at=now(), principal=false where id=$1', [req.params.id]);
    if (rows[0].principal) await c.query(
      `update vehiculos set principal=true where id=(select id from vehiculos where user_id=$1 and borrado_at is null order by created_at limit 1)`, [req.user.id]);
    await sincronizarPrincipal(c, req.user.id);
    await c.query('commit');
    res.json({ vehiculos: await lista(req.user.id) });
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
});

export default r;
