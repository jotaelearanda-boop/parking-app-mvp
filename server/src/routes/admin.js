import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { liberarAlVendedor, reembolsar } from '../config/liquidar.js';
import { pool } from '../config/db.js';
import { moverSaldo } from '../config/saldo.js';

const r = Router();
r.use(requireAuth, requireAdmin);

// Auditoría: toda consulta de datos personales y toda acción queda registrada (RGPD).
const log = (adminId, accion, tipo = null, id = null, detalle = null) =>
  query('insert into admin_log(admin_id, accion, objetivo_tipo, objetivo_id, detalle) values ($1,$2,$3,$4,$5)', [adminId, accion, tipo, id, detalle]).catch(() => {});

const CAMPOS_USUARIO = `u.id, u.name, u.email, u.phone, u.vehiculo_modelo, u.vehiculo_color, u.vehiculo_matricula,
  u.saldo_cents, u.rating_avg, u.rating_count, u.suspended_until, u.suspension_motivo, u.is_admin, u.created_at,
  u.consent_version, u.consent_at, u.stripe_account_id is not null as tiene_stripe`;

// Métricas: transacciones del día, comisiones ganadas y KPIs del MVP.
r.get('/resumen', async (_q, res) => {
  const [hoy, total, usuarios, plazas, rating, disputas] = await Promise.all([
    query(`select count(*)::int n, coalesce(sum(monto_cents),0)::int volumen, coalesce(sum(comision_cents),0)::int comision
             from transacciones where estado='liberada' and created_at >= date_trunc('day', now())`),
    query(`select count(*)::int n, coalesce(sum(comision_cents),0)::int comision from transacciones where estado='liberada'`),
    query(`select count(*)::int total, count(*) filter (where created_at >= now() - interval '7 days')::int ult7 from users`),
    query(`select count(*)::int hoy from plazas_activas where created_at >= date_trunc('day', now())`),
    query(`select coalesce(round(avg(rating_avg) filter (where rating_count > 0),2),0) avg from users`),
    query(`select count(*)::int abiertas from disputas where estado='abierta'`),
  ]);
  res.json({ hoy: hoy.rows[0], total: total.rows[0], usuarios: usuarios.rows[0], plazas_hoy: plazas.rows[0].hoy,
             rating_medio: rating.rows[0].avg, disputas_abiertas: disputas.rows[0].abiertas });
});

r.get('/disputas', async (_q, res) => {
  const { rows } = await query(
    `select d.id, d.transaccion_id, d.motivo, d.estado, d.created_at, t.monto_cents,
            v.name vendedor, v.email vendedor_email, c.name comprador, c.email comprador_email
       from disputas d join transacciones t on t.id=d.transaccion_id
       join users v on v.id=t.vendedor_id join users c on c.id=t.comprador_id
      order by (d.estado='abierta') desc, d.created_at desc limit 50`);
  res.json({ disputas: rows });
});

// Resolver: 'reembolsar' (al comprador) o 'pagar' (libera al vendedor).
r.post('/disputas/:id/resolver', async (req, res) => {
  const p = z.object({ accion: z.enum(['reembolsar', 'pagar']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Acción inválida' });
  const { rows } = await query("select transaccion_id from disputas where id=$1 and estado='abierta'", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Disputa no encontrada o ya resuelta' });
  const t = p.data.accion === 'reembolsar' ? await reembolsar(rows[0].transaccion_id) : await liberarAlVendedor(rows[0].transaccion_id);
  if (t) await log(req.user.id, `disputa_${p.data.accion}`, 'disputa', req.params.id);
  t ? res.json({ ok: true }) : res.status(409).json({ error: 'La transacción ya no está en disputa' });
});

// ---------- Usuarios ----------
r.get('/usuarios', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const { rows } = await query(
    `select ${CAMPOS_USUARIO},
            (select count(*)::int from transacciones t where u.id in (t.vendedor_id, t.comprador_id)) as n_transacciones
       from users u
      where $1 = '' or u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%' or u.phone ilike '%'||$1||'%' or u.vehiculo_matricula ilike '%'||upper($1)||'%'
      order by u.created_at desc limit 200`, [q]);
  await log(req.user.id, 'listar_usuarios', 'busqueda', null, { q, resultados: rows.length });
  res.json({ usuarios: rows });
});

r.get('/usuarios/:id', async (req, res) => {
  const { rows } = await query(`select ${CAMPOS_USUARIO} from users u where u.id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  const [tx, mov, disp, rat] = await Promise.all([
    query(`select id, estado, monto_cents, comision_cents, created_at, (vendedor_id=$1) as fue_vendedor from transacciones where $1 in (vendedor_id, comprador_id) order by created_at desc limit 30`, [req.params.id]),
    query('select tipo, monto_cents, transaccion_id, created_at from saldo_movimientos where user_id=$1 order by id desc limit 30', [req.params.id]),
    query(`select d.id, d.motivo, d.estado, d.created_at from disputas d join transacciones t on t.id=d.transaccion_id where $1 in (t.vendedor_id, t.comprador_id) order by d.created_at desc limit 20`, [req.params.id]),
    query('select estrellas, created_at from ratings where destino_id=$1 order by created_at desc limit 20', [req.params.id]),
  ]);
  await log(req.user.id, 'ver_usuario', 'usuario', req.params.id);
  res.json({ usuario: rows[0], transacciones: tx.rows, movimientos: mov.rows, disputas: disp.rows, ratings: rat.rows });
});

r.post('/usuarios/:id/suspender', async (req, res) => {
  const p = z.object({ dias: z.coerce.number().int().min(1).max(3650), motivo: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Indica los días (1-3650) y el motivo' });
  const { rowCount } = await query(
    `update users set suspended_until = now() + make_interval(days => $2), suspension_motivo=$3 where id=$1 and not is_admin`,
    [req.params.id, p.data.dias, p.data.motivo]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado o es administrador' });
  await log(req.user.id, 'suspender_usuario', 'usuario', req.params.id, p.data);
  res.json({ ok: true });
});

r.post('/usuarios/:id/reactivar', async (req, res) => {
  const { rowCount } = await query('update users set suspended_until=null, suspension_motivo=null where id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  await log(req.user.id, 'reactivar_usuario', 'usuario', req.params.id);
  res.json({ ok: true });
});

// Ajuste manual de saldo (cortesía, corrección). Siempre con motivo y queda auditado.
r.post('/usuarios/:id/ajuste-saldo', async (req, res) => {
  const p = z.object({ cents: z.coerce.number().int().refine((v) => v !== 0 && Math.abs(v) <= 5000, 'Entre -50 y 50 €'), motivo: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const c = await pool.connect();
  try {
    await c.query('begin');
    await moverSaldo(c, req.params.id, 'ajuste', p.data.cents);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    return res.status(e.code === '23514' ? 409 : 500).json({ error: e.code === '23514' ? 'El saldo no puede quedar negativo' : 'Error al ajustar' });
  } finally { c.release(); }
  await log(req.user.id, 'ajuste_saldo', 'usuario', req.params.id, p.data);
  res.json({ ok: true });
});

// ---------- Transacciones ----------
r.get('/transacciones', async (req, res) => {
  const estado = String(req.query.estado ?? '');
  const { rows } = await query(
    `select t.id, t.estado, t.monto_cents, t.comision_cents, t.pago_con_saldo, t.created_at,
            v.name vendedor, v.email vendedor_email, c.name comprador, c.email comprador_email
       from transacciones t join users v on v.id=t.vendedor_id join users c on c.id=t.comprador_id
      where $1 = '' or t.estado = $1 order by t.created_at desc limit 200`, [estado]);
  res.json({ transacciones: rows });
});

// ---------- Zonas bloqueadas (zona azul/naranja) ----------
r.get('/zonas', async (_q, res) => {
  const { rows } = await query(`select id, nombre, tipo, activa, created_at, round(ST_Area(geom)::numeric) as area_m2 from zonas_bloqueadas order by created_at desc`);
  res.json({ zonas: rows });
});

// Acepta GeoJSON (Feature, FeatureCollection o geometría: Polygon, MultiPolygon, LineString, Point).
// Las líneas y puntos se "engordan" buffer_m metros (una calle = línea + 12 m a cada lado).
r.post('/zonas', async (req, res) => {
  const p = z.object({
    nombre: z.string().trim().min(2).max(100), tipo: z.enum(['azul', 'naranja', 'verde', 'otra']).default('azul'),
    buffer_m: z.coerce.number().min(0).max(200).default(12), geojson: z.any(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  let gj = p.data.geojson;
  if (typeof gj === 'string') { try { gj = JSON.parse(gj); } catch { return res.status(400).json({ error: 'El GeoJSON no es válido' }); } }
  const geoms = [];
  const recoger = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features?.forEach(recoger);
    else if (g.type === 'Feature') recoger(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries?.forEach(recoger);
    else if (['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point'].includes(g.type)) geoms.push(g);
  };
  recoger(gj);
  if (!geoms.length) return res.status(400).json({ error: 'No encuentro geometrías válidas en el GeoJSON' });
  let creadas = 0;
  try {
    for (const g of geoms) {
      const buf = ['Polygon', 'MultiPolygon'].includes(g.type) ? 0 : p.data.buffer_m;
      await query(
        `insert into zonas_bloqueadas(nombre, tipo, creada_por, geom)
         values ($1,$2,$3, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)::geography, $5)::geometry),3))::geography)`,
        [p.data.nombre, p.data.tipo, req.user.id, JSON.stringify(g), buf]);
      creadas++;
    }
  } catch (e) { return res.status(400).json({ error: 'Geometría no válida: ' + e.message.slice(0, 120) }); }
  await log(req.user.id, 'crear_zona', 'zona', null, { nombre: p.data.nombre, tipo: p.data.tipo, creadas });
  res.status(201).json({ creadas });
});

r.patch('/zonas/:id', async (req, res) => {
  const { rowCount } = await query('update zonas_bloqueadas set activa=$2 where id=$1', [req.params.id, req.body?.activa === true]);
  if (!rowCount) return res.status(404).json({ error: 'Zona no encontrada' });
  await log(req.user.id, req.body?.activa === true ? 'activar_zona' : 'desactivar_zona', 'zona', req.params.id);
  res.json({ ok: true });
});

r.delete('/zonas/:id', async (req, res) => {
  const { rowCount } = await query('delete from zonas_bloqueadas where id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Zona no encontrada' });
  await log(req.user.id, 'borrar_zona', 'zona', req.params.id);
  res.status(204).end();
});

// ---------- Auditoría ----------
r.get('/log', async (_q, res) => {
  const { rows } = await query(
    `select l.id, l.accion, l.objetivo_tipo, l.objetivo_id, l.detalle, l.created_at, a.email as admin
       from admin_log l join users a on a.id=l.admin_id order by l.id desc limit 200`);
  res.json({ log: rows });
});

export default r;
