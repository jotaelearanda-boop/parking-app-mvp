import { useState } from 'react';
import CamposVehiculo from '../components/CamposVehiculo.jsx';
import Logo from '../components/Logo.jsx';
import GoogleBoton from '../components/GoogleBoton.jsx';
import { api, setSession } from '../services/api.js';

export default function Auth({ onLogin }) {
  const [modo, setModo] = useState('login');
  const [f, setF] = useState({ email: '', password: '', name: '', phone: '', vehiculo_modelo: '', vehiculo_color: '', vehiculo_matricula: '' });
  const [err, setErr] = useState('');
  const [acepta, setAcepta] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [g, setG] = useState(null);   // registro pendiente con Google: { token_registro, email, name }

  async function conGoogle(credential) {
    setErr('');
    try {
      const r = await api.google(credential);
      if (r.registro_pendiente) { setG(r); setF((x) => ({ ...x, name: r.name, phone: '' })); return; }
      setSession(r.token); onLogin(r.user);
    } catch (x) { setErr(x.message); }
  }
  async function terminarGoogle(e) {
    e.preventDefault(); setErr('');
    if (!acepta) { setErr('Debes aceptar los términos y la política de privacidad para crear la cuenta'); return; }
    try {
      const r = await api.googleRegistro({ token_registro: g.token_registro, name: f.name, phone: f.phone, vehiculo_modelo: f.vehiculo_modelo, vehiculo_color: f.vehiculo_color, vehiculo_matricula: f.vehiculo_matricula, acepta_politicas: true });
      setSession(r.token); onLogin(r.user);
    } catch (x) { setErr(x.message); }
  }

  async function enviar(e) {
    e.preventDefault(); setErr('');
    try {
      if (modo === 'registro' && !acepta) { setErr('Debes aceptar los términos y la política de privacidad para crear la cuenta'); return; }
      const r = modo === 'login' ? await api.login(f) : await api.registro({ ...f, acepta_politicas: true });
      setSession(r.token); onLogin(r.user);
    } catch (x) { setErr(x.message); }
  }
  const input = 'w-full rounded-lg border p-3';
  const consentimiento = (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
      <span>He leído y acepto los <a href="/terminos" target="_blank" rel="noreferrer" className="text-brand-600 underline">Términos de uso</a> y la{' '}
        <a href="/privacidad" target="_blank" rel="noreferrer" className="text-brand-600 underline">Política de privacidad</a>, incluido el uso de mi
        <b> ubicación</b> para publicar plazas y de los datos de mi coche.</span>
    </label>);
  if (g) return (
    <form onSubmit={terminarGoogle} className="mx-auto mt-16 max-w-sm space-y-3 p-4">
      <h1 className="text-2xl font-bold">Casi listo</h1>
      <p className="text-sm text-gray-600">Entras con <b>{g.email}</b>. Faltan unos datos para usar la app.</p>
      <input className={input} placeholder="Nombre" value={f.name} onChange={set('name')} required minLength={2} />
      <input className={input} placeholder="Teléfono" type="tel" value={f.phone} onChange={set('phone')} required />
      <p className="pt-1 text-sm text-gray-600">Tu coche (el comprador/vendedor lo verá solo tras pagar, para reconoceros en la calle)</p>
      <CamposVehiculo f={f} set={set} />
      {consentimiento}
      {err && <p className="text-red-600">{err}</p>}
      <button className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white">Crear cuenta</button>
      <button type="button" className="w-full text-sm text-brand-600" onClick={() => { setG(null); setErr(''); }}>Cancelar</button>
    </form>);
  return (
    <form onSubmit={enviar} className="mx-auto mt-16 max-w-sm space-y-3 p-4">
      <div className="pb-2 text-center"><Logo className="text-4xl" /><p className="mt-1 text-sm text-gray-600">Aparca sin vueltas</p></div>
      <h1 className="text-2xl font-bold">{modo === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
      {modo === 'registro' && <>
        <input className={input} placeholder="Nombre" value={f.name} onChange={set('name')} required />
        <input className={input} placeholder="Teléfono" type="tel" value={f.phone} onChange={set('phone')} required />
      </>}
      {modo === 'registro' && <p className="pt-1 text-sm text-gray-600">Tu coche (el comprador/vendedor lo verá solo tras pagar, para reconoceros en la calle)</p>}
      {modo === 'registro' && <CamposVehiculo f={f} set={set} />}
      <input className={input} placeholder="Email" type="email" value={f.email} onChange={set('email')} required />
      <input className={input} placeholder="Contraseña (mín. 8)" type="password" value={f.password} onChange={set('password')} required />
      {modo === 'registro' && consentimiento}
      {err && <p className="text-red-600">{err}</p>}
      <button className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white">Continuar</button>
      <button type="button" className="w-full text-sm text-brand-600" onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}>
        {modo === 'login' ? '¿Sin cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
      </button>
      <GoogleBoton onCredential={conGoogle} />
    </form>
  );
}
