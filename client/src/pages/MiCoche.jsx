import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import CamposVehiculo from '../components/CamposVehiculo.jsx';
import { IconoCoche } from '../components/Iconos.jsx';
import { useToast } from '../components/Toast.jsx';
import AvisosPush from '../components/AvisosPush.jsx';
import VenderPlaza from './VenderPlaza.jsx';
import { posicionActual } from '../services/geolocation.js';
import { api } from '../services/api.js';
import { onMensaje } from '../services/ws.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const ESTADO = { pendiente_pago: 'Pendiente de pago', en_escrow: 'Pagada', liberada: 'Completada', reembolsada: 'Reembolsada', disputada: 'En disputa', cancelada: 'Cancelada' };

function Coche({ user, onUser }) {
  const aviso = useToast();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ vehiculo_modelo: user.vehiculo_modelo ?? '', vehiculo_color: user.vehiculo_color ?? '', vehiculo_matricula: user.vehiculo_matricula ?? '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = (e) => { e.preventDefault(); api.guardarVehiculo(f).then((r) => { onUser(r.user); setEdit(false); aviso('Coche guardado', 'ok'); }).catch((x) => aviso(x.message, 'error')); };

  if (edit) return (
    <form onSubmit={guardar} className="space-y-2 rounded-xl border bg-white p-4">
      <CamposVehiculo f={f} set={set} />
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-lg border p-2" onClick={() => setEdit(false)}>Cancelar</button>
        <button className="flex-[2] rounded-lg bg-blue-600 p-2 font-semibold text-white">Guardar</button>
      </div>
    </form>);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4">
      <div className="text-blue-600"><IconoCoche /></div>
      <div className="flex-1">
        <p className="font-semibold">{user.vehiculo_modelo ? `${user.vehiculo_modelo} · ${user.vehiculo_color}` : 'Añade tu coche'}</p>
        {user.vehiculo_matricula && <p className="mt-1 inline-block rounded border-2 border-gray-800 bg-yellow-50 px-2 font-mono font-bold tracking-widest">{user.vehiculo_matricula}</p>}
      </div>
      <button className="text-sm text-blue-600" onClick={() => setEdit(true)}>Editar</button>
    </div>);
}

export default function MiCoche({ user, onUser }) {
  const aviso = useToast();
  const [plaza, setPlaza] = useState(undefined);   // undefined = cargando, null = sin plaza publicada
  const [ocupa, setOcupa] = useState(null);         // plaza que ocupo (comprada o marcada a mano), aún sin vender
  const [hist, setHist] = useState([]);
  const cargar = useCallback(() => {
    api.miPlaza().then((r) => setPlaza(r.plaza)).catch(() => setPlaza(null));
    api.ocupacion().then((r) => setOcupa(r.ocupacion)).catch(() => {});
    api.misTransacciones().then((r) => setHist(r.transacciones)).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => onMensaje((m) => { if (['comprador_interesado', 'plaza_pagada', 'reembolsado', 'plaza_lista'].includes(m.tipo)) cargar(); }), [cargar]);

  const marcarAparcado = () => posicionActual()
    .then((p) => api.marcarOcupacion(p.lat, p.lng))
    .then((r) => { setOcupa(r.ocupacion); aviso('Anotado: te recordaremos que puedes vender tu plaza', 'ok'); })
    .catch(() => aviso('No pude obtener tu ubicación. Revisa el permiso de localización.', 'error'));
  const yaNoTengo = () => confirm('¿Ya no tienes esa plaza?') && api.liberarOcupacion().then(() => { setOcupa(null); aviso('Hecho', 'ok'); });

  const cancelar = () => api.cancelarPlaza(plaza.id).then(() => { aviso('Plaza cancelada', 'ok'); cargar(); }).catch((e) => aviso(e.message, 'error'));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Mi coche</h1>
      <Coche user={user} onUser={onUser} />
      <AvisosPush />

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
        {plaza === null && !ocupa && (
          <div className="space-y-2">
            <VenderPlaza onPublicada={cargar} />
            <button onClick={marcarAparcado} className="w-full rounded-xl border bg-white p-3 font-semibold">🚗 Estoy aparcado aquí (aún no vendo)</button>
            <p className="text-xs text-gray-500">Si ya has aparcado, márcalo: te recordaremos que puedes vender tu plaza cuando te vayas.</p>
          </div>)}
        {plaza && (
          <div className="space-y-1 rounded-xl border bg-white p-4">
            <p className="text-lg font-bold">{eur(plaza.precio_cents)} · {plaza.estado === 'disponible' ? 'Publicada' : 'Reservada'}</p>
            <p className="text-gray-600">{plaza.estado === 'disponible' ? 'Sigue publicada hasta que alguien la reserve o la canceles.' : 'Alguien la ha reservado.'}</p>
            {plaza.transaccion_id && <NavLink to={`/transaccion/${plaza.transaccion_id}`} className="mt-2 block rounded-lg bg-blue-600 p-3 text-center font-semibold text-white">Ver la reserva</NavLink>}
            {plaza.estado === 'disponible' && <button onClick={cancelar} className="mt-2 w-full rounded-lg border p-3">Cancelar plaza</button>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Historial</h2>
        {!hist.length && <p className="text-gray-500">Aún no tienes ventas ni compras.</p>}
        {hist.map((t) => (
          <NavLink key={t.id} to={`/transaccion/${t.id}`} className="flex justify-between rounded-lg border bg-white p-3">
            <span>{t.soy_vendedor ? 'Venta' : 'Compra'} · {eur(t.monto_cents)}</span>
            <span className="text-gray-500">{ESTADO[t.estado] ?? t.estado}</span>
          </NavLink>
        ))}
      </section>
    </div>);
}
