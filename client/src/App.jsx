import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Transaccion from './pages/Transaccion.jsx';
import MiCoche from './pages/MiCoche.jsx';
import { IconoBuscar, IconoCartera, IconoCoche, IconoCuenta } from './components/Iconos.jsx';
import Cuenta from './pages/Cuenta.jsx';
import Saldo from './pages/Saldo.jsx';
import Auth from './pages/Auth.jsx';
import { Privacidad, Terminos } from './pages/Legal.jsx';
import BuscarPlaza from './pages/BuscarPlaza.jsx';
import { api, getToken, setSession } from './services/api.js';
import { cerrarWs, conectarWs, onMensaje } from './services/ws.js';

// Usuarios anteriores a las políticas (o con una versión antigua) deben aceptar para seguir usando la app.
function AceptarPoliticas({ onOk }) {
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Antes de continuar</h1>
      <p>Hemos añadido unos términos de uso y una política de privacidad (incluido el uso de tu ubicación). Necesitamos que los aceptes para seguir usando la app.</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Acepto los <a href="/terminos" target="_blank" rel="noreferrer" className="text-blue-600 underline">Términos de uso</a> y la{' '}
          <a href="/privacidad" target="_blank" rel="noreferrer" className="text-blue-600 underline">Política de privacidad</a>.</span>
      </label>
      {err && <p className="text-red-600">{err}</p>}
      <button disabled={!ok} className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300"
        onClick={() => api.consentimiento().then((r) => onOk(r.user)).catch((e) => setErr(e.message))}>Aceptar y continuar</button>
    </div>);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(!!getToken());
  const [aviso, setAviso] = useState(null);
  const nav = useNavigate();
  const location = useLocation();
  const TEXTOS = {
    match: '¡Match! 🚘 Hay una plaza cerca. Toca para verla', comprador_interesado: 'Tienes un comprador interesado', plaza_pagada: 'Plaza pagada: ya puedes avisar de tu salida',
    saldo_recargado: 'Saldo recargado', disputa_abierta: 'El comprador ha reportado un problema', reembolsado: 'Importe reembolsado', aviso_reputacion: 'Aviso: tu valoración media es baja', pago_confirmado: 'Pago confirmado', retirada_pagada: 'Tu retirada ha sido pagada', retirada_rechazada: 'Tu retirada no se pudo pagar: el saldo ha vuelto a tu cuenta', comprador_llego: 'El comprador ha llegado, puedes salir', plaza_lista: 'Plaza lista para ocupar', chat: 'Nuevo mensaje',
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
  if (!user) return (
    <Routes>
      <Route path="/terminos" element={<Terminos />} />
      <Route path="/privacidad" element={<Privacidad />} />
      <Route path="*" element={<Auth onLogin={setUser} />} />
    </Routes>);
  if (location.pathname === '/terminos') return <Terminos />;
  if (location.pathname === '/privacidad') return <Privacidad />;
  if (!user.politicas_ok) return <AceptarPoliticas onOk={setUser} />;

  const tab = ({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-blue-600' : 'text-gray-500'}`;
  return (
    <div className="mx-auto max-w-xl pb-24">
      <Routes>
        <Route path="/" element={<BuscarPlaza />} />
        <Route path="/coche" element={<MiCoche />} />
        <Route path="/vender" element={<Navigate to="/coche" replace />} />
        <Route path="/mis" element={<Navigate to="/coche" replace />} />
        <Route path="/transaccion/:id" element={<Transaccion user={user} />} />
        <Route path="/cuenta" element={<Cuenta user={user} onSalir={() => { cerrarWs(); setSession(null); setUser(null); nav('/'); }} />} />
        <Route path="/saldo" element={<Saldo user={user} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      {aviso && (
        <button onClick={() => { nav(aviso.plaza_id ? `/?plaza=${aviso.plaza_id}` : `/transaccion/${aviso.transaccion_id}`); setAviso(null); }}
          className="fixed inset-x-4 top-3 z-50 mx-auto max-w-xl rounded-lg bg-gray-900 p-3 text-left text-white shadow-lg">🔔 {aviso.texto}</button>
      )}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-xl border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={tab}><IconoBuscar />Buscar</NavLink>
        <NavLink to="/coche" className={tab}><IconoCoche />Mis coches</NavLink>
        <NavLink to="/saldo" className={tab}><IconoCartera />Saldo</NavLink>
        <NavLink to="/cuenta" className={tab}><IconoCuenta />Mi cuenta</NavLink>
      </nav>
    </div>
  );
}
