import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import CamposVehiculo from '../components/CamposVehiculo.jsx';
import { IconoCoche } from '../components/Iconos.jsx';
import { useToast } from '../components/Toast.jsx';
import VenderPlaza from './VenderPlaza.jsx';
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
  const [plaza, setPlaza] = useState(undefined);   // undefined = cargando, null = sin plaza
  const [hist, setHist] = useState([]);
  const cargar = useCallback(() => {
    api.miPlaza().then((r) => setPlaza(r.plaza)).catch(() => setPlaza(null));
    api.misTransacciones().then((r) => setHist(r.transacciones)).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => onMensaje((m) => { if (['comprador_interesado', 'plaza_pagada', 'reembolsado'].includes(m.tipo)) cargar(); }), [cargar]);

  const cancelar = () => api.cancelarPlaza(plaza.id).then(() => { aviso('Plaza cancelada', 'ok'); cargar(); }).catch((e) => aviso(e.message, 'error'));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Mi coche</h1>
      <Coche user={user} onUser={onUser} />

      <section className="space-y-2">
        <h2 className="font-semibold">Mi plaza</h2>
        {plaza === undefined && <p className="text-gray-500">Cargando…</p>}
        {plaza === null && <VenderPlaza onPublicada={cargar} />}
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
