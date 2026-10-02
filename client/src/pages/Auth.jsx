import { useState } from 'react';
import { api, setSession } from '../services/api.js';

export default function Auth({ onLogin }) {
  const [modo, setModo] = useState('login');
  const [f, setF] = useState({ email: '', password: '', name: '', phone: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function enviar(e) {
    e.preventDefault(); setErr('');
    try {
      const r = modo === 'login' ? await api.login(f) : await api.registro(f);
      setSession(r.token); onLogin(r.user);
    } catch (x) { setErr(x.message); }
  }
  const input = 'w-full rounded-lg border p-3';
  return (
    <form onSubmit={enviar} className="mx-auto mt-16 max-w-sm space-y-3 p-4">
      <h1 className="text-2xl font-bold">{modo === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
      {modo === 'registro' && <>
        <input className={input} placeholder="Nombre" value={f.name} onChange={set('name')} required />
        <input className={input} placeholder="Teléfono" type="tel" value={f.phone} onChange={set('phone')} required />
      </>}
      <input className={input} placeholder="Email" type="email" value={f.email} onChange={set('email')} required />
      <input className={input} placeholder="Contraseña (mín. 8)" type="password" value={f.password} onChange={set('password')} required />
      {err && <p className="text-red-600">{err}</p>}
      <button className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white">Continuar</button>
      <button type="button" className="w-full text-sm text-blue-600" onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}>
        {modo === 'login' ? '¿Sin cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
      </button>
    </form>
  );
}
