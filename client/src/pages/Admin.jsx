import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { api } from '../services/api.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const fecha = (d) => new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const suspendido = (u) => u.suspended_until && new Date(u.suspended_until) > new Date();

const Etiqueta = ({ children, color = 'bg-gray-100 text-gray-700' }) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{children}</span>;
const Tarjeta = ({ t, v }) => <div className="rounded-lg border bg-white p-3"><p className="text-xs text-gray-500">{t}</p><p className="text-xl font-bold">{v}</p></div>;

// ------------------------------------------------------------------ Resumen
function Resumen() {
  const [r, setR] = useState(null);
  useEffect(() => { api.adminResumen().then(setR).catch(() => {}); }, []);
  if (!r) return <p>Cargando…</p>;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Tarjeta t="Transacciones hoy" v={r.hoy.n} /><Tarjeta t="Comisión hoy" v={eur(r.hoy.comision)} />
      <Tarjeta t="Comisión total" v={eur(r.total.comision)} /><Tarjeta t="Volumen hoy" v={eur(r.hoy.volumen)} />
      <Tarjeta t="Usuarios (últimos 7 d)" v={`${r.usuarios.total} (${r.usuarios.ult7})`} /><Tarjeta t="Plazas publicadas hoy" v={r.plazas_hoy} />
      <Tarjeta t="Valoración media" v={r.rating_medio} /><Tarjeta t="Reclamaciones abiertas" v={r.disputas_abiertas} />
    </div>
  );
}

// ------------------------------------------------------------------ Usuarios
function Usuarios() {
  const aviso = useToast();
  const [q, setQ] = useState('');
  const [lista, setLista] = useState([]);
  const [det, setDet] = useState(null);
  const buscar = useCallback((texto) => api.adminUsuarios(texto).then((r) => setLista(r.usuarios)).catch((e) => aviso(e.message, 'error')), [aviso]);
  useEffect(() => { const t = setTimeout(() => buscar(q), 300); return () => clearTimeout(t); }, [q, buscar]);
  const abrir = (id) => api.adminUsuario(id).then(setDet).catch((e) => aviso(e.message, 'error'));
  const accion = (fn, ok) => fn().then(() => { aviso(ok, 'ok'); abrir(det.usuario.id); buscar(q); }).catch((e) => aviso(e.message, 'error'));

  if (det) {
    const u = det.usuario;
    return (
      <div className="space-y-3">
        <button className="text-blue-600" onClick={() => setDet(null)}>← Volver al listado</button>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{u.name}</h2>
            {u.is_admin && <Etiqueta color="bg-purple-100 text-purple-800">Admin</Etiqueta>}
            {suspendido(u) && <Etiqueta color="bg-red-100 text-red-800">Suspendido hasta {fecha(u.suspended_until)}</Etiqueta>}
            {u.tiene_stripe && <Etiqueta color="bg-green-100 text-green-800">Cobros verificados</Etiqueta>}
          </div>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
            <div><dt className="inline text-gray-500">Email: </dt><dd className="inline">{u.email}</dd></div>
            <div><dt className="inline text-gray-500">Teléfono: </dt><dd className="inline">{u.phone}</dd></div>
            <div><dt className="inline text-gray-500">Coche: </dt><dd className="inline">{u.vehiculo_modelo ?? '—'} · {u.vehiculo_color ?? ''} · <b className="font-mono">{u.vehiculo_matricula ?? '—'}</b></dd></div>
            <div><dt className="inline text-gray-500">Saldo: </dt><dd className="inline font-semibold">{eur(u.saldo_cents)}</dd></div>
            <div><dt className="inline text-gray-500">Valoración: </dt><dd className="inline">★ {Number(u.rating_avg).toFixed(1)} ({u.rating_count})</dd></div>
            <div><dt className="inline text-gray-500">Alta: </dt><dd className="inline">{fecha(u.created_at)}</dd></div>
            <div><dt className="inline text-gray-500">Políticas aceptadas: </dt><dd className="inline">{u.consent_version ? `${u.consent_version} (${fecha(u.consent_at)})` : 'No'}</dd></div>
            {u.suspension_motivo && <div><dt className="inline text-gray-500">Motivo suspensión: </dt><dd className="inline">{u.suspension_motivo}</dd></div>}
          </dl>
          {!u.is_admin && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suspendido(u)
                ? <button className="rounded-lg border px-3 py-2" onClick={() => accion(() => api.adminReactivar(u.id), 'Usuario reactivado')}>Reactivar</button>
                : <button className="rounded-lg border border-red-300 px-3 py-2 text-red-700" onClick={() => {
                    const dias = Number(prompt('¿Cuántos días de suspensión?', '7')); if (!dias) return;
                    const motivo = prompt('Motivo (obligatorio):'); if (!motivo) return;
                    accion(() => api.adminSuspender(u.id, dias, motivo), 'Usuario suspendido');
                  }}>Suspender…</button>}
              <button className="rounded-lg border px-3 py-2" onClick={() => {
                const eurTxt = prompt('Importe del ajuste en € (negativo para restar, máx. ±50):', '1'); if (!eurTxt) return;
                const cents = Math.round(Number(eurTxt.replace(',', '.')) * 100); if (!cents) return;
                const motivo = prompt('Motivo (obligatorio):'); if (!motivo) return;
                accion(() => api.adminAjuste(u.id, cents, motivo), 'Saldo ajustado');
              }}>Ajustar saldo…</button>
            </div>)}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border bg-white p-3"><h3 className="mb-1 font-semibold">Movimientos de saldo</h3>
            {!det.movimientos.length && <p className="text-sm text-gray-500">Sin movimientos</p>}
            {det.movimientos.map((m, i) => <p key={i} className="flex justify-between border-b py-1 text-sm"><span>{m.tipo} <span className="text-gray-400">{fecha(m.created_at)}</span></span><b className={m.monto_cents > 0 ? 'text-green-700' : ''}>{eur(m.monto_cents)}</b></p>)}
          </section>
          <section className="rounded-xl border bg-white p-3"><h3 className="mb-1 font-semibold">Transacciones</h3>
            {!det.transacciones.length && <p className="text-sm text-gray-500">Sin transacciones</p>}
            {det.transacciones.map((t) => <p key={t.id} className="flex justify-between border-b py-1 text-sm"><span>{t.fue_vendedor ? 'Venta' : 'Compra'} <span className="text-gray-400">{fecha(t.created_at)}</span></span><span>{eur(t.monto_cents)} · {t.estado}</span></p>)}
          </section>
          <section className="rounded-xl border bg-white p-3"><h3 className="mb-1 font-semibold">Reclamaciones</h3>
            {!det.disputas.length && <p className="text-sm text-gray-500">Ninguna</p>}
            {det.disputas.map((d) => <p key={d.id} className="border-b py-1 text-sm">“{d.motivo}” · {d.estado} <span className="text-gray-400">{fecha(d.created_at)}</span></p>)}
          </section>
          <section className="rounded-xl border bg-white p-3"><h3 className="mb-1 font-semibold">Valoraciones recibidas</h3>
            {!det.ratings.length && <p className="text-sm text-gray-500">Ninguna</p>}
            <p className="text-sm">{det.ratings.map((r) => '★'.repeat(r.estrellas)).join('  ')}</p>
          </section>
        </div>
        <p className="text-xs text-gray-500">Tu consulta de esta ficha queda registrada en la auditoría.</p>
      </div>);
  }

  return (
    <div className="space-y-3">
      <input className="w-full rounded-lg border p-3" placeholder="Buscar por nombre, email, teléfono o matrícula" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-sm text-gray-500">{lista.length} usuarios</p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-2">Usuario</th><th>Teléfono</th><th>Coche</th><th>Saldo</th><th>★</th><th>Op.</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className="cursor-pointer border-t hover:bg-blue-50" onClick={() => abrir(u.id)}>
                <td className="p-2"><b>{u.name}</b><br /><span className="text-gray-500">{u.email}</span></td>
                <td>{u.phone}</td>
                <td>{u.vehiculo_modelo ?? '—'}<br /><span className="font-mono text-xs">{u.vehiculo_matricula}</span></td>
                <td>{eur(u.saldo_cents)}</td><td>{Number(u.rating_avg).toFixed(1)} ({u.rating_count})</td><td>{u.n_transacciones}</td>
                <td>{u.is_admin ? <Etiqueta color="bg-purple-100 text-purple-800">Admin</Etiqueta> : suspendido(u) ? <Etiqueta color="bg-red-100 text-red-800">Suspendido</Etiqueta> : <Etiqueta color="bg-green-100 text-green-800">Activo</Etiqueta>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
}

// ------------------------------------------------------------------ Reclamaciones
function Reclamaciones() {
  const aviso = useToast();
  const [disp, setDisp] = useState([]);
  const cargar = useCallback(() => api.adminDisputas().then((x) => setDisp(x.disputas)).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);
  const resolver = (id, accion) => api.adminResolver(id, accion).then(() => { aviso('Reclamación resuelta', 'ok'); cargar(); }).catch((e) => aviso(e.message, 'error'));
  if (!disp.length) return <p className="text-gray-500">No hay reclamaciones.</p>;
  return disp.map((d) => (
    <div key={d.id} className="mb-2 space-y-1 rounded-xl border bg-white p-3">
      <p><b>{d.comprador}</b> ({d.comprador_email}) vs <b>{d.vendedor}</b> ({d.vendedor_email}) · {eur(d.monto_cents)} · <Etiqueta color={d.estado === 'abierta' ? 'bg-yellow-100 text-yellow-800' : ''}>{d.estado}</Etiqueta></p>
      <p className="text-sm text-gray-600">“{d.motivo}” · {fecha(d.created_at)}</p>
      {d.estado === 'abierta' && <div className="flex gap-2">
        <button onClick={() => resolver(d.id, 'reembolsar')} className="flex-1 rounded bg-red-600 p-2 text-white">Reembolsar al comprador</button>
        <button onClick={() => resolver(d.id, 'pagar')} className="flex-1 rounded bg-green-600 p-2 text-white">Pagar al vendedor</button>
      </div>}
    </div>));
}

// ------------------------------------------------------------------ Transacciones
function Transacciones() {
  const [estado, setEstado] = useState('');
  const [l, setL] = useState([]);
  useEffect(() => { api.adminTransacciones(estado).then((r) => setL(r.transacciones)).catch(() => {}); }, [estado]);
  return (
    <div className="space-y-3">
      <select className="rounded-lg border p-2" value={estado} onChange={(e) => setEstado(e.target.value)}>
        <option value="">Todas</option>
        {['pendiente_pago', 'en_escrow', 'liberada', 'disputada', 'reembolsada', 'cancelada'].map((e) => <option key={e}>{e}</option>)}
      </select>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-2">Fecha</th><th>Vendedor</th><th>Comprador</th><th>Importe</th><th>Comisión</th><th>Pago</th><th>Estado</th></tr></thead>
          <tbody>{l.map((t) => (
            <tr key={t.id} className="border-t"><td className="p-2">{fecha(t.created_at)}</td><td>{t.vendedor}</td><td>{t.comprador}</td>
              <td>{eur(t.monto_cents)}</td><td>{eur(t.comision_cents)}</td><td>{t.pago_con_saldo ? 'Saldo' : 'Tarjeta'}</td><td>{t.estado}</td></tr>))}</tbody>
        </table>
      </div>
    </div>);
}

// ------------------------------------------------------------------ Zonas bloqueadas (azul / naranja)
function Zonas() {
  const aviso = useToast();
  const [zonas, setZonas] = useState([]);
  const [f, setF] = useState({ nombre: '', tipo: 'azul', buffer_m: 12, geojson: '' });
  const cargar = useCallback(() => api.adminZonas().then((r) => setZonas(r.zonas)).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);
  const crear = (e) => {
    e.preventDefault();
    api.adminCrearZona({ ...f, buffer_m: Number(f.buffer_m) })
      .then((r) => { aviso(`${r.creadas} zona(s) creada(s)`, 'ok'); setF({ ...f, nombre: '', geojson: '' }); cargar(); })
      .catch((x) => aviso(x.message, 'error'));
  };
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-blue-50 p-3 text-sm">
        En las zonas bloqueadas <b>no se pueden publicar plazas</b> (zona azul, naranja, etc.) y se pintan en el mapa de los usuarios.
        Dibuja la calle o el polígono en <a className="underline" href="https://geojson.io" target="_blank" rel="noreferrer">geojson.io</a>, copia el GeoJSON y pégalo aquí.
        Una <b>línea</b> (calle) se ensancha los metros indicados a cada lado.
      </p>
      <form onSubmit={crear} className="space-y-2 rounded-xl border bg-white p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="rounded border p-2" placeholder="Nombre (p. ej. Calle Pardo Gimeno)" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
          <select className="rounded border p-2" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="azul">Zona azul</option><option value="naranja">Zona naranja</option><option value="verde">Zona verde</option><option value="otra">Otra</option>
          </select>
          <label className="flex items-center gap-2 text-sm">Ancho (m)<input type="number" className="w-20 rounded border p-2" min="0" max="200" value={f.buffer_m} onChange={(e) => setF({ ...f, buffer_m: e.target.value })} /></label>
        </div>
        <textarea className="h-32 w-full rounded border p-2 font-mono text-xs" placeholder='{"type":"FeatureCollection","features":[ ... ]}' value={f.geojson} onChange={(e) => setF({ ...f, geojson: e.target.value })} required />
        <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Añadir zona</button>
      </form>
      {!zonas.length && <p className="text-gray-500">Todavía no hay zonas bloqueadas.</p>}
      {zonas.map((z) => (
        <div key={z.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
          <div className="flex-1"><b>{z.nombre}</b> <Etiqueta color={z.tipo === 'naranja' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}>{z.tipo}</Etiqueta>
            <p className="text-xs text-gray-500">{z.area_m2} m² · {fecha(z.created_at)}</p></div>
          <button className="rounded border px-3 py-1" onClick={() => api.adminZonaActiva(z.id, !z.activa).then(cargar)}>{z.activa ? 'Desactivar' : 'Activar'}</button>
          <button className="rounded border border-red-300 px-3 py-1 text-red-700" onClick={() => confirm(`¿Borrar "${z.nombre}"?`) && api.adminBorrarZona(z.id).then(cargar)}>Borrar</button>
        </div>))}
    </div>);
}

// ------------------------------------------------------------------ Auditoría
function Auditoria() {
  const [l, setL] = useState([]);
  useEffect(() => { api.adminLog().then((r) => setL(r.log)).catch(() => {}); }, []);
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-2">Fecha</th><th>Admin</th><th>Acción</th><th>Objetivo</th><th>Detalle</th></tr></thead>
        <tbody>{l.map((x) => (
          <tr key={x.id} className="border-t align-top"><td className="p-2">{fecha(x.created_at)}</td><td>{x.admin}</td><td>{x.accion}</td>
            <td className="font-mono text-xs">{x.objetivo_tipo} {x.objetivo_id?.slice(0, 8)}</td><td className="font-mono text-xs">{x.detalle ? JSON.stringify(x.detalle) : ''}</td></tr>))}</tbody>
      </table>
    </div>);
}

// ------------------------------------------------------------------ Contenedor
const TABS = [['resumen', 'Resumen', Resumen], ['usuarios', 'Usuarios', Usuarios], ['reclamaciones', 'Reclamaciones', Reclamaciones],
  ['transacciones', 'Transacciones', Transacciones], ['zonas', 'Zonas', Zonas], ['auditoria', 'Auditoría', Auditoria]];

export default function Admin() {
  const [tab, setTab] = useState('resumen');
  const Vista = TABS.find((t) => t[0] === tab)[2];
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Backoffice</h1>
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map(([id, nombre]) => (
          <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap px-3 py-2 font-semibold ${tab === id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>{nombre}</button>))}
      </div>
      <Vista />
    </div>);
}
