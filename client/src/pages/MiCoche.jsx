import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Coches from '../components/Coches.jsx';
import { useToast } from '../components/Toast.jsx';
import AvisosPush from '../components/AvisosPush.jsx';
import VenderPlaza from './VenderPlaza.jsx';
import { posicionActual } from '../services/geolocation.js';
import { api } from '../services/api.js';
import { onMensaje } from '../services/ws.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';

export default function MiCoche() {
  const aviso = useToast();
  const [plaza, setPlaza] = useState(undefined);   // undefined = cargando, null = sin plaza publicada
  const [caducada, setCaducada] = useState(null);   // última plaza caducada (renovable durante 1 h)
  const [ahora, setAhora] = useState(Date.now());
  const [ocupa, setOcupa] = useState(null);         // plaza que ocupo (comprada o marcada a mano), aún sin vender
  const cargar = useCallback(() => {
    api.miPlaza().then((r) => { setPlaza(r.plaza); setCaducada(r.caducada); }).catch(() => setPlaza(null));
    api.ocupacion().then((r) => setOcupa(r.ocupacion)).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  // Cuenta atrás de la plaza publicada; al llegar a 0 se vuelve a consultar al servidor.
  useEffect(() => {
    if (!plaza?.expira_at) return;
    const t = setInterval(() => { setAhora(Date.now()); if (Date.now() > new Date(plaza.expira_at).getTime() + 1500) cargar(); }, 1000);
    return () => clearInterval(t);
  }, [plaza, cargar]);
  useEffect(() => onMensaje((m) => { if (['comprador_interesado', 'plaza_pagada', 'reembolsado', 'plaza_lista', 'plaza_caducada'].includes(m.tipo)) cargar(); }), [cargar]);

  const marcarAparcado = () => posicionActual()
    .then((p) => api.marcarOcupacion(p.lat, p.lng))
    .then((r) => { setOcupa(r.ocupacion); aviso('Anotado: te recordaremos que puedes vender tu plaza', 'ok'); })
    .catch(() => aviso('No pude obtener tu ubicación. Revisa el permiso de localización.', 'error'));
  const yaNoTengo = () => confirm('¿Ya no tienes esa plaza?') && api.liberarOcupacion().then(() => { setOcupa(null); aviso('Hecho', 'ok'); });

  const renovar = () => api.renovarPlaza(caducada.id).then(() => { aviso('Plaza renovada otros 10 minutos', 'ok'); cargar(); }).catch((e) => { aviso(e.message, 'error'); cargar(); });
  const cancelar = () => api.cancelarPlaza(plaza.id).then(() => { aviso('Plaza cancelada', 'ok'); cargar(); }).catch((e) => aviso(e.message, 'error'));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Mis coches</h1>
      <Coches />
      <AvisosPush soloSiInactivo />

      <section className="space-y-2">
        <h2 className="font-semibold">Mi plaza</h2>
        {plaza === undefined && <p className="text-gray-500">Cargando…</p>}
        {plaza === null && ocupa && (
          <div className="space-y-2 rounded-xl border bg-white p-4">
            <p className="font-semibold">🅿️ Tienes plaza</p>
            <p className="text-sm text-gray-600">{ocupa.origen === 'comprada' ? 'La conseguiste en la app' : 'La marcaste tú'} el {new Date(ocupa.desde).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}. No caduca: véndela cuando te vayas.</p>
            <VenderPlaza onPublicada={cargar} inicio={{ lat: ocupa.lat, lng: ocupa.lng }} />
            <button onClick={yaNoTengo} className="w-full rounded-lg border p-2 text-sm text-gray-600">Ya no tengo esta plaza</button>
          </div>)}
        {plaza === null && caducada && (
          <div className="space-y-2 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
            <p className="font-semibold">⏱️ Tu plaza ha caducado</p>
            <p className="text-sm text-gray-700">Nadie la reservó en 10 minutos y ya no se muestra. ¿Sigues ahí?</p>
            <button onClick={renovar} className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white">Renovar otros 10 min · {eur(caducada.precio_cents)}</button>
          </div>)}
        {plaza === null && !ocupa && (
          <div className="space-y-2">
            <VenderPlaza onPublicada={cargar} />
            <button onClick={marcarAparcado} className="w-full rounded-xl border bg-white p-3 font-semibold">🚗 Estoy aparcado aquí (aún no vendo)</button>
            <p className="text-xs text-gray-500">Si ya has aparcado, márcalo: te recordaremos que puedes vender tu plaza cuando te vayas.</p>
          </div>)}
        {plaza && (
          <div className="space-y-1 rounded-xl border bg-white p-4">
            <p className="text-lg font-bold">{eur(plaza.precio_cents)} · {plaza.estado === 'disponible' ? 'Publicada' : 'Reservada'}</p>
            <p className="text-gray-600">{plaza.estado === 'disponible' ? `Visible ${plaza.expira_at ? `${Math.max(0, Math.floor((new Date(plaza.expira_at) - ahora) / 60000))}:${String(Math.max(0, Math.floor(((new Date(plaza.expira_at) - ahora) % 60000) / 1000))).padStart(2, '0')} más` : ''}. Si nadie la reserva, caducará.` : 'Alguien la ha reservado.'}</p>
            {plaza.transaccion_id && <NavLink to={`/transaccion/${plaza.transaccion_id}`} className="mt-2 block rounded-lg bg-brand-600 p-3 text-center font-semibold text-white">Ver la reserva</NavLink>}
            {plaza.estado === 'disponible' && <button onClick={cancelar} className="mt-2 w-full rounded-lg border p-3">Cancelar plaza</button>}
          </div>
        )}
      </section>
    </div>);
}
