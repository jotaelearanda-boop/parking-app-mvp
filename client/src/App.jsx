import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Auth from './pages/Auth.jsx';
import BuscarPlaza from './pages/BuscarPlaza.jsx';
import VenderPlaza from './pages/VenderPlaza.jsx';
import { api, getToken, setSession } from './services/api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(!!getToken());

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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-xl border-t bg-white">
        <NavLink to="/" end className={tab}>Buscar</NavLink>
        <NavLink to="/vender" className={tab}>Vender</NavLink>
        <button className="flex-1 p-3 text-gray-500" onClick={() => { setSession(null); setUser(null); }}>Salir</button>
      </nav>
    </div>
  );
}
