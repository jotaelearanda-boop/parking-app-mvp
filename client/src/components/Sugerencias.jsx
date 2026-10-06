import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast.jsx';
import { api } from '../services/api.js';

const TIPOS = [['sugerencia', '💡 Sugerencia'], ['error', '🐞 Error'], ['mejora', '✨ Mejora']];
const NOMBRE = Object.fromEntries(TIPOS);
const ESTADO = { abierta: 'Enviado', respondida: 'Respondido', cerrada: 'Cerrado' };
const fecha = (d) => new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// «Sugerencias, errores o mejoras»: el usuario escribe al equipo y ve sus respuestas.
export default function Sugerencias({ abrirId = null }) {
  const aviso = useToast();
  const [lista, setLista] = useState(null);
  const [tipo, setTipo] = useState('sugerencia');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [det, setDet] = useState(null);       // { sugerencia, mensajes }
  const [resp, setResp] = useState('');
  const cargar = useCallback(() => api.sugerencias().then((r) => setLista(r.sugerencias)).catch(() => setLista([])), []);
  useEffect(() => { cargar(); }, [cargar]);
  const abrir = useCallback((id) => api.sugerencia(id).then((d) => { setDet(d); cargar(); }).catch((e) => aviso(e.message, 'error')), [cargar, aviso]);
  useEffect(() => { if (abrirId) abrir(abrirId); }, [abrirId, abrir]);

  const enviar = (e) => {
    e.preventDefault(); setEnviando(true);
    api.enviarSugerencia({ tipo, texto, pantalla: 'Mi cuenta' })
      .then(() => { aviso('Gracias, lo hemos recibido. Te contestaremos aquí', 'ok'); setTexto(''); cargar(); })
      .catch((x) => aviso(x.message, 'error')).finally(() => setEnviando(false));
  };
  const contestar = (e) => {
    e.preventDefault();
    api.responderSugerencia(det.sugerencia.id, resp).then(() => { setResp(''); abrir(det.sugerencia.id); }).catch((x) => aviso(x.message, 'error'));
  };

  if (det) {
    const s = det.sugerencia;
    return (
      <div className="space-y-3">
        <button className="text-brand-600" onClick={() => setDet(null)}>← Mis mensajes</button>
        <p className="font-semibold">{NOMBRE[s.tipo]} <span className="ml-1 text-sm font-normal text-gray-500">{ESTADO[s.estado]} · {fecha(s.created_at)}</span></p>
        <div className="space-y-2">
          {det.mensajes.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-xl p-3 ${m.autor === 'equipo' ? 'bg-brand-50' : 'ml-auto border bg-white'}`}>
              <p className="whitespace-pre-wrap text-sm">{m.texto}</p>
              <p className="mt-1 text-xs text-gray-400">{m.autor === 'equipo' ? 'Equipo APParK' : 'Tú'} · {fecha(m.created_at)}</p>
            </div>))}
        </div>
        {s.estado !== 'cerrada'
          ? (
            <form onSubmit={contestar} className="space-y-2">
              <textarea className="min-h-20 w-full rounded-lg border p-3" placeholder="Escribe otro mensaje" maxLength={2000} required value={resp} onChange={(e) => setResp(e.target.value)} />
              <button className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white">Enviar</button>
            </form>)
          : <p className="text-sm text-gray-500">Este mensaje está cerrado. Si necesitas algo más, envía uno nuevo.</p>}
      </div>);
  }
  return (
    <div className="space-y-4">
      <form onSubmit={enviar} className="space-y-2 rounded-xl border bg-white p-4">
        <p className="font-semibold">Sugerencias, errores o mejoras</p>
        <p className="text-sm text-gray-600">Cuéntanos qué falla, qué echas de menos o qué cambiarías. Te contestamos aquí mismo.</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo de mensaje">
          {TIPOS.map(([id, nombre]) => (
            <button type="button" key={id} role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)}
              className={`flex-1 rounded-lg border p-2 text-sm ${tipo === id ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : ''}`}>{nombre}</button>))}
        </div>
        <textarea className="min-h-28 w-full rounded-lg border p-3" placeholder={tipo === 'error' ? 'Qué estabas haciendo y qué pasó' : 'Escribe aquí'} minLength={5} maxLength={2000} required value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button disabled={enviando} className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white disabled:bg-gray-300">Enviar</button>
      </form>
      {lista?.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">Mis mensajes</p>
          {lista.map((s) => (
            <button key={s.id} onClick={() => abrir(s.id)} className="block w-full rounded-lg border bg-white p-3 text-left">
              <div className="flex items-center gap-2 text-sm"><b>{NOMBRE[s.tipo]}</b><span className="text-gray-500">{ESTADO[s.estado]}</span>
                {s.sin_leer > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">Respuesta nueva</span>}
                <span className="ml-auto text-xs text-gray-400">{fecha(s.updated_at)}</span></div>
              <p className="line-clamp-2 text-sm text-gray-700">{s.texto}</p>
            </button>))}
        </div>)}
    </div>);
}
