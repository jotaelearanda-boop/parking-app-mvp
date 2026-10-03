import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import AvisosPush from '../components/AvisosPush.jsx';
import { api } from '../services/api.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const ESTADO = { pendiente_pago: 'Pendiente de pago', en_escrow: 'Pagada', liberada: 'Completada', reembolsada: 'Reembolsada', disputada: 'En disputa', cancelada: 'Cancelada' };

function Historial() {
  const [hist, setHist] = useState(null);
  useEffect(() => { api.misTransacciones().then((r) => setHist(r.transacciones)).catch(() => setHist([])); }, []);
  if (!hist) return <p className="text-gray-500">Cargando…</p>;
  if (!hist.length) return <p className="text-gray-500">Aún no tienes ventas ni compras.</p>;
  return (
    <div className="space-y-2">
      {hist.map((t) => (
        <NavLink key={t.id} to={`/transaccion/${t.id}`} className="flex justify-between rounded-lg border bg-white p-3">
          <span>{t.soy_vendedor ? 'Venta' : 'Compra'} · {eur(t.monto_cents)}</span>
          <span className="text-gray-500">{ESTADO[t.estado] ?? t.estado}</span>
        </NavLink>))}
    </div>);
}

// Mi cuenta: datos básicos, historial, notificaciones y cierre de sesión (con confirmación).
export default function Cuenta({ user, onSalir }) {
  const [tab, setTab] = useState('historial');
  const [confirmando, setConfirmando] = useState(false);
  const pestana = (id) => `flex-1 rounded-lg p-2 text-sm font-semibold ${tab === id ? 'bg-white shadow' : 'text-gray-500'}`;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Mi cuenta</h1>
      <div className="rounded-xl border bg-white p-4">
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-gray-600">{user.email}</p>
        <p className="text-sm text-gray-600">{user.phone}</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        <button role="tab" aria-selected={tab === 'historial'} className={pestana('historial')} onClick={() => setTab('historial')}>Historial</button>
        <button role="tab" aria-selected={tab === 'notif'} className={pestana('notif')} onClick={() => setTab('notif')}>Notificaciones</button>
      </div>
      {tab === 'historial' ? <Historial /> : <AvisosPush />}
      <button onClick={() => setConfirmando(true)} className="w-full rounded-xl border p-3 font-semibold text-red-600">Cerrar sesión</button>

      {confirmando && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setConfirmando(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">¿Cerrar sesión?</p>
            <p className="text-sm text-gray-600">Dejarás de recibir avisos en la app abierta. Podrás volver a entrar cuando quieras.</p>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg border p-3" onClick={() => setConfirmando(false)}>Cancelar</button>
              <button className="flex-1 rounded-lg bg-red-600 p-3 font-semibold text-white" onClick={onSalir}>Cerrar sesión</button>
            </div>
          </div>
        </div>)}
    </div>);
}
