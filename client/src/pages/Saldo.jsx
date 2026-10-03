import { useCallback, useEffect, useState } from 'react';
import Pago from '../components/Pago.jsx';
import { api } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';
import { onMensaje } from '../services/ws.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const TIPOS = { venta: 'Venta de plaza', pago_plaza: 'Pago de plaza', recarga: 'Recarga', retirada: 'Retirada', reembolso: 'Reembolso', ajuste: 'Ajuste' };

export default function Saldo({ user }) {
  const aviso = useToast();
  const [d, setD] = useState(null);
  const [retirando, setRetirando] = useState(false);
  const [f, setF] = useState({ metodo: 'bizum', telefono: user?.phone ?? '', iban: '', titular: '' });
  const [secret, setSecret] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = useCallback(() => api.saldo().then(setD).catch((e) => setMsg(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => onMensaje((m) => { if (['saldo_recargado', 'retirada_pagada', 'retirada_rechazada'].includes(m.tipo)) { setSecret(null); cargar(); } }), [cargar]);

  const recargar = (c) => api.recargar(c).then((r) => setSecret(r.client_secret)).catch((e) => setMsg(e.message));
  const enviarRetirada = (e) => {
    e.preventDefault();
    api.retirar(f).then(() => { aviso('Solicitud enviada. Te avisaremos cuando esté pagada.', 'ok'); setRetirando(false); cargar(); })
      .catch((x) => aviso(x.message, 'error'));
  };

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
      {d.retirada_pendiente ? (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="font-semibold">Retirada en curso · {eur(d.retirada_pendiente.importe_cents)}</p>
          <p className="text-sm text-gray-700">Por {d.retirada_pendiente.metodo === 'bizum' ? 'Bizum' : 'transferencia'}. La pagamos manualmente en 1 a 3 días laborables y te avisaremos.</p>
        </div>
      ) : retirando ? (
        <form onSubmit={enviarRetirada} className="space-y-2 rounded-xl border bg-white p-3">
          <p className="font-semibold">Retirar {eur(d.saldo_cents)}</p>
          <div className="flex gap-2">
            {[['bizum', 'Bizum'], ['iban', 'Transferencia']].map(([v, n]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, metodo: v })}
                className={`flex-1 rounded-lg border p-2 font-semibold ${f.metodo === v ? 'border-blue-600 bg-blue-50 text-blue-700' : ''}`}>{n}</button>))}
          </div>
          {f.metodo === 'bizum' ? (
            <label className="block text-sm">Móvil que recibe el Bizum
              <input className="mt-1 w-full rounded border p-2" type="tel" required value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></label>
          ) : (<>
            <label className="block text-sm">IBAN
              <input className="mt-1 w-full rounded border p-2 uppercase" required value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} placeholder="ES00 0000 0000 0000 0000 0000" /></label>
            <label className="block text-sm">Titular de la cuenta
              <input className="mt-1 w-full rounded border p-2" required value={f.titular} onChange={(e) => setF({ ...f, titular: e.target.value })} /></label>
          </>)}
          <p className="text-xs text-gray-500">Se retira todo el saldo. Lo pagamos manualmente en 1 a 3 días laborables. Sin comisión.</p>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border p-2" onClick={() => setRetirando(false)}>Cancelar</button>
            <button className="flex-[2] rounded-lg bg-blue-600 p-2 font-semibold text-white">Solicitar retirada</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setRetirando(true)} disabled={d.saldo_cents < d.limites.retirada_min}
          className="w-full rounded-lg border p-3 disabled:text-gray-400">Retirar mi saldo (mín. {eur(d.limites.retirada_min)})</button>
      )}
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
