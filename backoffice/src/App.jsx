import { useEffect, useState } from 'react';
import Panel from './vistas.jsx';
import { useToast } from './Toast.jsx';
import { api, getToken, setToken } from './api.js';

function Login({ onOk }) {
  const aviso = useToast();
  const [f, setF] = useState({ email: '', password: '' });
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault(); setEnviando(true);
    try { const r = await api.login(f.email, f.password); setToken(r.token); onOk(r.usuario); }
    catch (x) { aviso(x.message, 'error'); }
    setEnviando(false);
  };
  return (
    <form onSubmit={entrar} className="mx-auto mt-24 max-w-sm space-y-3 rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">Backoffice</h1>
      <p className="text-sm text-gray-500">Acceso restringido al equipo. Los accesos quedan registrados.</p>
      <input className="w-full rounded-lg border p-3" type="email" placeholder="Email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input className="w-full rounded-lg border p-3" type="password" placeholder="Contraseña" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <button disabled={enviando} className="w-full rounded-lg bg-gray-900 p-3 font-semibold text-white disabled:opacity-50">Entrar</button>
    </form>);
}

export default function App() {
  const [yo, setYo] = useState(null);
  const [cargando, setCargando] = useState(!!getToken());
  useEffect(() => {
    if (getToken()) api.yo().then((r) => setYo(r.usuario)).catch(() => setToken(null)).finally(() => setCargando(false));
  }, []);
  if (cargando) return <p className="p-6">Cargando…</p>;
  if (!yo) return <Login onOk={setYo} />;
  return (
    <div className="mx-auto max-w-6xl space-y-3 p-4">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Backoffice · APParK</h1>
        <span className="ml-auto text-sm text-gray-500">{yo.name} · {yo.rol}</span>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => { setToken(null); setYo(null); }}>Salir</button>
      </header>
      <Panel yo={yo} />
    </div>);
}
