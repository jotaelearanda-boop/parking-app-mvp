import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Transaccion from './pages/Transaccion.jsx';
import MiCoche from './pages/MiCoche.jsx';
import { IconoBuscar, IconoCartera, IconoCoche, IconoEscudo, IconoSalir } from './components/Iconos.jsx';
import Admin from './pages/Admin.jsx';
import Saldo from './pages/Saldo.jsx';
import Auth from './pages/Auth.jsx';
import BuscarPlaza from './pages/BuscarPlaza.jsx';
import { api, getToken, setSession } from './services/api.js';
import { cerrarWs, conectarWs, onMensaje } from './services/ws.js';

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

  const tab = ({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-blue-600' : 'text-gray-500'}`;
  return (
    <div className="mx-auto max-w-xl pb-24">
      <Routes>
        <Route path="/" element={<BuscarPlaza />} />
        <Route path="/coche" element={<MiCoche user={user} onUser={setUser} />} />
        <Route path="/vender" element={<Navigate to="/coche" replace />} />
        <Route path="/mis" element={<Navigate to="/coche" replace />} />
        <Route path="/transaccion/:id" element={<Transaccion user={user} />} />
        {user.is_admin && <Route path="/admin" element={<Admin />} />}
        <Route path="/saldo" element={<Saldo />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      {aviso && (
        <button onClick={() => { nav(`/transaccion/${aviso.transaccion_id}`); setAviso(null); }}
          className="fixed inset-x-4 top-3 z-50 mx-auto max-w-xl rounded-lg bg-gray-900 p-3 text-left text-white shadow-lg">🔔 {aviso.texto}</button>
      )}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-xl border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={tab}><IconoBuscar />Buscar</NavLink>
        <NavLink to="/coche" className={tab}><IconoCoche />Mi coche</NavLink>
        <NavLink to="/saldo" className={tab}><IconoCartera />Saldo</NavLink>
        {user.is_admin && <NavLink to="/admin" className={tab}><IconoEscudo />Admin</NavLink>}
        <button className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-gray-500" onClick={() => { cerrarWs(); setSession(null); setUser(null); }}><IconoSalir />Salir</button>
      </nav>
    </div>
  );
}
