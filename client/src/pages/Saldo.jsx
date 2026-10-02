import { useCallback, useEffect, useState } from 'react';
import Pago from '../components/Pago.jsx';
import { api } from '../services/api.js';
import { onMensaje } from '../services/ws.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const TIPOS = { venta: 'Venta de plaza', pago_plaza: 'Pago de plaza', recarga: 'Recarga', retirada: 'Retirada', reembolso: 'Reembolso', ajuste: 'Ajuste' };

export default function Saldo() {
  const [d, setD] = useState(null);
  const [secret, setSecret] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = useCallback(() => api.saldo().then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => onMensaje((m) => { if (m.tipo === 'saldo_recargado') { setSecret(null); cargar(); } }), [cargar]);

  const recargar = (c) => api.recargar(c).then((r) => setSecret(r.client_secret)).catch((e) => setMsg(e.message));
  const retirar = () => api.retirar().then((r) => { setMsg(`Retirados ${eur(r.retirado_cents)}`); cargar(); })
    .catch((e) => (e.codigo === 'stripe_onboarding' ? api.stripeOnboarding().then((r) => { location.href = r.url; }) : setMsg(e.message)));

  if (!d) return <p className="p-4">{msg || 'Cargando…'}</p>;
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl bg-blue-600 p-5 text-white">
        <p className="text-sm opacity-80">Saldo (crédito de la app)</p>
        <p className="text-4xl font-bold">{eur(d.saldo_cents)}</p>
      </div>
      <p className="text-sm text-gray-600">Se usa automáticamente al reservar una plaza si te alcanza. Sin comisiones de tarjeta.</p>
      {msg && <p className="text-blue-700">{msg}</p>}
      {secret ? <Pago clientSecret={secret} returnPath="/saldo" /> : (
        <div className="flex gap-2">
          {[1000, 2000, 5000].filter((c) => d.saldo_cents + c <= d.limites.saldo_max).map((c) => (
            <button key={c} onClick={() => recargar(c)} className="flex-1 rounded-lg border bg-white p-3 font-semibold">Recargar {c / 100} €</button>
          ))}
        </div>
      )}
      <button onClick={retirar} disabled={d.saldo_cents < d.limites.retirada_min}
        className="w-full rounded-lg border p-3 disabled:text-gray-400">Retirar a mi cuenta (mín. {eur(d.limites.retirada_min)})</button>
      <h2 className="pt-2 font-semibold">Movimientos</h2>
      {!d.movimientos.length && <p className="text-gray-500">Sin movimientos todavía.</p>}
      {d.movimientos.map((m, i) => (
        <p key={i} className="flex justify-between border-b py-1">
          <span>{TIPOS[m.tipo] ?? m.tipo}<span className="ml-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString()}</span></span>
          <b className={m.monto_cents > 0 ? 'text-green-700' : ''}>{m.monto_cents > 0 ? '+' : ''}{eur(m.monto_cents)}</b>
        </p>
      ))}
    </div>
  );
}
