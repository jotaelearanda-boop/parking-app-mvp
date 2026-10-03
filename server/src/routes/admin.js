import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { permiso, requireStaff } from '../middleware/staff.js';
import { liberarAlVendedor, reembolsar } from '../config/liquidar.js';
import { pool } from '../config/db.js';
import { moverSaldo } from '../config/saldo.js';
import { notify } from '../ws.js';
import { evento } from '../config/audit.js';

const r = Router();
r.use(requireStaff);

// Cada petición al backoffice queda registrada (quién, qué, desde dónde y con qué resultado).
r.use((req, res, next) => {
  res.on('finish', () => {
    query('insert into admin_log(admin_id, accion, objetivo_tipo, objetivo_id, detalle, ip, user_agent) values ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, 'http', 'peticion', null, { metodo: req.method, ruta: req.originalUrl.split('?')[0], status: res.statusCode }, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 200)]).catch(() => {});
  });
  next();
});

// Auditoría: toda consulta de datos personales y toda acción queda registrada (RGPD).
const log = (adminId, accion, tipo = null, id = null, detalle = null) =>
  query('insert into admin_log(admin_id, accion, objetivo_tipo, objetivo_id, detalle) values ($1,$2,$3,$4,$5)', [adminId, accion, tipo, id, detalle]).catch(() => {});
const pt = (req) => ({ rol: req.user.rol });

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
r.post('/disputas/:id/resolver', permiso('reclamaciones'), async (req, res) => {
  const p = z.object({ accion: z.enum(['reembolsar', 'pagar']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Acción inválida' });
  const { rows } = await query("select transaccion_id from disputas where id=$1 and estado='abierta'", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Disputa no encontrada o ya resuelta' });
  const t = p.data.accion === 'reembolsar' ? await reembolsar(rows[0].transaccion_id) : await liberarAlVendedor(rows[0].transaccion_id);
  if (t) await log(req.user.id, `disputa_${p.data.accion}`, 'disputa', req.params.id);
  t ? res.json({ ok: true }) : res.status(409).json({ error: 'La transacción ya no está en disputa' });
});

r.get('/yo', (req, res) => res.json({ usuario: { id: req.user.id, name: req.user.name, email: req.user.email, rol: req.user.rol, permisos: req.permisos } }));

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

r.post('/usuarios/:id/suspender', permiso('suspender'), async (req, res) => {
  const p = z.object({ dias: z.coerce.number().int().min(1).max(3650), motivo: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Indica los días (1-3650) y el motivo' });
  const { rowCount } = await query(
    `update users set suspended_until = now() + make_interval(days => $2), suspension_motivo=$3 where id=$1 and not is_admin`,
    [req.params.id, p.data.dias, p.data.motivo]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado o es administrador' });
  await log(req.user.id, 'suspender_usuario', 'usuario', req.params.id, p.data);
  res.json({ ok: true });
});

r.post('/usuarios/:id/reactivar', permiso('suspender'), async (req, res) => {
  const { rowCount } = await query('update users set suspended_until=null, suspension_motivo=null where id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  await log(req.user.id, 'reactivar_usuario', 'usuario', req.params.id);
  res.json({ ok: true });
});

// Ajuste manual de saldo (cortesía, corrección). Siempre con motivo y queda auditado.
r.post('/usuarios/:id/ajuste-saldo', permiso('ajuste_saldo'), async (req, res) => {
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
r.get('/zonas', permiso('zonas'), async (_q, res) => {
  const { rows } = await query(`select id, nombre, tipo, activa, created_at, round(ST_Area(geom)::numeric) as area_m2 from zonas_bloqueadas order by created_at desc`);
  res.json({ zonas: rows });
});

// Acepta GeoJSON (Feature, FeatureCollection o geometría: Polygon, MultiPolygon, LineString, Point).
// Las líneas y puntos se "engordan" buffer_m metros (una calle = línea + 12 m a cada lado).
r.post('/zonas', permiso('zonas'), async (req, res) => {
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

r.patch('/zonas/:id', permiso('zonas'), async (req, res) => {
  const { rowCount } = await query('update zonas_bloqueadas set activa=$2 where id=$1', [req.params.id, req.body?.activa === true]);
  if (!rowCount) return res.status(404).json({ error: 'Zona no encontrada' });
  await log(req.user.id, req.body?.activa === true ? 'activar_zona' : 'desactivar_zona', 'zona', req.params.id);
  res.json({ ok: true });
});

r.delete('/zonas/:id', permiso('zonas'), async (req, res) => {
  const { rowCount } = await query('delete from zonas_bloqueadas where id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Zona no encontrada' });
  await log(req.user.id, 'borrar_zona', 'zona', req.params.id);
  res.status(204).end();
});

// ---------- Retiradas de saldo (solo superadmin) ----------
r.get('/retiradas', permiso('retiradas'), async (req, res) => {
  const estado = String(req.query.estado ?? 'pendiente');
  const { rows } = await query(
    `select t.id, t.importe_cents, t.metodo, t.telefono, t.iban, t.titular, t.estado, t.referencia, t.motivo_rechazo, t.solicitada_at, t.resuelta_at,
            u.name, u.email, u.phone as telefono_cuenta
       from retiradas t join users u on u.id=t.user_id
      where $1 = '' or t.estado = $1 order by (t.estado='pendiente') desc, t.solicitada_at desc limit 200`, [estado]);
  await log(req.user.id, 'ver_retiradas', 'retiradas', null, { estado, n: rows.length });   // contiene IBAN: queda registrado
  res.json({ retiradas: rows });
});

r.post('/retiradas/:id/pagar', permiso('retiradas'), async (req, res) => {
  const referencia = String(req.body?.referencia ?? '').trim().slice(0, 100) || null;
  const { rows } = await query(
    `update retiradas set estado='pagada', referencia=$2, resuelta_at=now(), resuelta_por=$3 where id=$1 and estado='pendiente' returning user_id, importe_cents`,
    [req.params.id, referencia, req.user.id]);
  if (!rows[0]) return res.status(409).json({ error: 'La retirada ya no está pendiente' });
  await log(req.user.id, 'pagar_retirada', 'retirada', req.params.id, { importe_cents: rows[0].importe_cents, referencia });
  evento('retirada_pagada', { userId: rows[0].user_id, data: { id: req.params.id, importe: rows[0].importe_cents } });
  notify(rows[0].user_id, 'retirada_pagada', {});
  res.json({ ok: true });
});

r.post('/retiradas/:id/rechazar', permiso('retiradas'), async (req, res) => {
  const p = z.object({ motivo: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Indica el motivo del rechazo' });
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows } = await c.query(
      `update retiradas set estado='rechazada', motivo_rechazo=$2, resuelta_at=now(), resuelta_por=$3 where id=$1 and estado='pendiente' returning user_id, importe_cents`,
      [req.params.id, p.data.motivo, req.user.id]);
    if (!rows[0]) { await c.query('rollback'); return res.status(409).json({ error: 'La retirada ya no está pendiente' }); }
    await moverSaldo(c, rows[0].user_id, 'reembolso', rows[0].importe_cents, { stripeRef: `retirada-rechazada-${req.params.id}` });   // el saldo vuelve al usuario
    await c.query('commit');
    await log(req.user.id, 'rechazar_retirada', 'retirada', req.params.id, { importe_cents: rows[0].importe_cents, motivo: p.data.motivo });
    evento('retirada_rechazada', { userId: rows[0].user_id, data: { id: req.params.id, motivo: p.data.motivo } });
    notify(rows[0].user_id, 'retirada_rechazada', {});
    res.json({ ok: true });
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
});

// ---------- Auditoría ----------
r.get('/log', permiso('auditoria'), async (req, res) => {
  const soloAcciones = req.query.http !== '1';   // por defecto oculta el ruido de peticiones GET/HTTP
  const { rows } = await query(
    `select l.id, l.accion, l.objetivo_tipo, l.objetivo_id, l.detalle, l.ip, l.created_at, a.email as admin
       from admin_log l join users a on a.id=l.admin_id where ($1::boolean = false or l.accion <> 'http') order by l.id desc limit 300`, [soloAcciones]);
  res.json({ log: rows });
});

// Eventos del sistema (registros, accesos, pagos, reembolsos, retiradas...).
r.get('/eventos', permiso('auditoria'), async (req, res) => {
  const tipo = String(req.query.tipo ?? '');
  const { rows } = await query(
    `select e.id, e.tipo, e.payload, e.ip, e.created_at, u.email from eventos e left join users u on u.id=e.user_id
      where $1 = '' or e.tipo like $1 || '%' order by e.id desc limit 300`, [tipo]);
  res.json({ eventos: rows });
});

// ---------- Equipo (solo superadmin) ----------
r.get('/equipo', permiso('equipo'), async (_q, res) => {
  const { rows } = await query(`select id, name, email, rol, created_at from users where rol <> 'usuario' order by rol, created_at`);
  res.json({ equipo: rows });
});

r.post('/equipo', permiso('equipo'), async (req, res) => {
  const p = z.object({ email: z.string().email(), rol: z.enum(['usuario', 'gestor', 'superadmin']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Email y rol (usuario, gestor o superadmin)' });
  const email = p.data.email.toLowerCase();
  const { rows } = await query('select id, rol from users where email=$1', [email]);
  if (!rows[0]) return res.status(404).json({ error: 'Ese email no tiene cuenta en la app. Que se registre primero.' });
  if (rows[0].id === req.user.id) return res.status(409).json({ error: 'No puedes cambiar tu propio rol' });
  await query('update users set rol=$2, is_admin=$3 where id=$1', [rows[0].id, p.data.rol, p.data.rol !== 'usuario']);
  await log(req.user.id, 'cambiar_rol', 'usuario', rows[0].id, { email, de: rows[0].rol, a: p.data.rol });
  res.json({ ok: true });
});

export default r;
