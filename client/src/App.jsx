import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Transaccion from './pages/Transaccion.jsx';
import CamposVehiculo from './components/CamposVehiculo.jsx';
import Admin from './pages/Admin.jsx';
import Saldo from './pages/Saldo.jsx';
import Auth from './pages/Auth.jsx';
import BuscarPlaza from './pages/BuscarPlaza.jsx';
import VenderPlaza from './pages/VenderPlaza.jsx';
import { api, getToken, setSession } from './services/api.js';
import { cerrarWs, conectarWs, onMensaje } from './services/ws.js';

function MiCoche({ user, onUser }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ vehiculo_modelo: user.vehiculo_modelo ?? '', vehiculo_color: user.vehiculo_color ?? '', vehiculo_matricula: user.vehiculo_matricula ?? '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = (e) => { e.preventDefault(); api.guardarVehiculo(f).then((r) => { onUser(r.user); setEdit(false); }).catch((x) => setErr(x.message)); };
  if (!edit) return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-gray-500">Mi coche</p>
      <p className="font-semibold">{user.vehiculo_modelo ? `${user.vehiculo_modelo} · ${user.vehiculo_color} · ${user.vehiculo_matricula}` : 'Sin datos'}</p>
      <button className="text-sm text-blue-600" onClick={() => setEdit(true)}>Editar</button>
    </div>
  );
  return (
    <form onSubmit={guardar} className="space-y-2 rounded-lg border bg-white p-3">
      <CamposVehiculo f={f} set={set} />
      {err && <p className="text-red-600">{err}</p>}
      <button className="w-full rounded-lg bg-blue-600 p-2 font-semibold text-white">Guardar</button>
    </form>
  );
}

function MisTransacciones({ user, onUser }) {
  const [l, setL] = useState([]);
  useEffect(() => { api.misTransacciones().then((r) => setL(r.transacciones)); }, []);
  return (
    <div className="space-y-2 p-4">
      <MiCoche user={user} onUser={onUser} />
      <h1 className="pt-2 text-xl font-bold">Mis plazas</h1>
      {!l.length && <p className="text-gray-500">Aún no tienes transacciones.</p>}
      {l.map((t) => (
        <NavLink key={t.id} to={`/transaccion/${t.id}`} className="block rounded-lg border bg-white p-3">
          {t.soy_vendedor ? 'Venta' : 'Compra'} · {(t.monto_cents / 100).toFixed(2)} € · {t.estado}
        </NavLink>
      ))}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(!!getToken());
  const [aviso, setAviso] = useState(null);
  const nav = useNavigate();
  const TEXTOS = {
    comprador_interesado: 'Tienes un comprador interesado', plaza_pagada: 'Plaza pagada: ya puedes avisar de tu salida',
    saldo_recargado: 'Saldo recargado', disputa_abierta: 'El comprador ha reportado un problema', reembolsado: 'Importe reembolsado', aviso_reputacion: 'Aviso: tu valoración media es baja', pago_confirmado: 'Pago confirmado', comprador_llego: 'El comprador ha llegado, puedes salir', plaza_lista: 'Plaza lista para ocupar', chat: 'Nuevo mensaje',
  };

  useEffect(() => {
    if (!user) return;
    conectarWs();
    const off = onMensaje((m) => { setAviso({ ...m, texto: TEXTOS[m.tipo] ?? m.tipo }); setTimeout(() => setAviso(null), 8000); });
    return () => { off(); };
  }, [user]);

  useEffect(() => {
    if (getToken()) api.yo().then((r) => setUser(r.user)).catch(() => setSession(null)).finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="p-4">Cargando…</p>;
  if (!user) return <Auth onLogin={setUser} />;

  const tab = ({ isActive }) => `flex-1 p-3 text-center font-semibold ${isActive ? 'text-blue-600' : 'text-gray-500'}`;
  return (
    <div className="mx-auto max-w-xl pb-16">
      <Routes>
        <Route path="/" element={<BuscarPlaza />} />
        <Route path="/vender" element={<VenderPlaza />} />
        <Route path="/transaccion/:id" element={<Transaccion user={user} />} />
        {user.is_admin && <Route path="/admin" element={<Admin />} />}
        <Route path="/saldo" element={<Saldo />} />
        <Route path="/mis" element={<MisTransacciones user={user} onUser={setUser} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      {aviso && (
        <button onClick={() => { nav(`/transaccion/${aviso.transaccion_id}`); setAviso(null); }}
          className="fixed inset-x-4 top-3 z-50 mx-auto max-w-xl rounded-lg bg-gray-900 p-3 text-left text-white shadow-lg">🔔 {aviso.texto}</button>
      )}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-xl border-t bg-white">
        <NavLink to="/" end className={tab}>Buscar</NavLink>
        <NavLink to="/vender" className={tab}>Vender</NavLink>
        <NavLink to="/mis" className={tab}>Mis plazas</NavLink>
        <NavLink to="/saldo" className={tab}>Saldo</NavLink>
        {user.is_admin && <NavLink to="/admin" className={tab}>Admin</NavLink>}
        <button className="flex-1 p-3 text-gray-500" onClick={() => { cerrarWs(); setSession(null); setUser(null); }}>Salir</button>
      </nav>
    </div>
  );
}
