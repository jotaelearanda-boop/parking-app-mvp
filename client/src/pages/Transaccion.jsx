import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Pago from '../components/Pago.jsx';
import Mapa from '../components/Mapa.jsx';
import { api } from '../services/api.js';
import { onMensaje } from '../services/ws.js';

const ESTADOS = {
  pendiente_pago: 'Pendiente de pago', en_escrow: 'Pagada (fondos retenidos)', liberada: 'Completada',
  reembolsada: 'Reembolsada', disputada: 'En disputa', cancelada: 'Cancelada',
};

export default function Transaccion({ user }) {
  const { id } = useParams();
  const { state } = useLocation();
  const clientSecret = state?.clientSecret;
  const [tx, setTx] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [err, setErr] = useState('');
  const fin = useRef();

  const cargar = useCallback(() => api.transaccion(id).then(setTx).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { cargar(); api.chat(id).then((r) => setMsgs(r.mensajes)); }, [id, cargar]);
  useEffect(() => onMensaje((m) => {
    if (m.transaccion_id !== id) return;
    if (m.tipo === 'chat') setMsgs((x) => (x.some((y) => y.id === m.mensaje.id) ? x : [...x, m.mensaje]));
    else cargar();
  }), [id, cargar]);
  useEffect(() => fin.current?.scrollIntoView(), [msgs]);

  const accion = (fn) => () => fn(id).then(cargar).catch((e) => setErr(e.message));
  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    try { const m = await api.enviarChat(id, texto); setMsgs((x) => [...x, m]); setTexto(''); } catch (x) { setErr(x.message); }
  }

  if (!tx) return <p className="p-4">{err || 'Cargando…'}</p>;
  const soyVendedor = tx.vendedor_id === user.id;
  const btn = 'w-full rounded-lg bg-blue-600 p-3 font-semibold text-white';
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">{soyVendedor ? 'Tu venta' : 'Tu compra'} · {(tx.monto_cents / 100).toFixed(2).replace('.', ',')} €</h1>
      <p className="rounded bg-blue-50 p-2">Estado: <b>{ESTADOS[tx.estado] ?? tx.estado}</b></p>
      {err && <p className="text-red-600">{err}</p>}

      {!soyVendedor && tx.lat && <>
        <Mapa center={{ lat: tx.lat, lng: tx.lng }} markers={[{ id: 'p', lat: tx.lat, lng: tx.lng, label: 'P' }]} className="h-56 w-full" />
        <img src={tx.foto_matricula_url} alt="Matrícula" className="max-h-40 rounded" />
      </>}

      {!soyVendedor && tx.estado === 'pendiente_pago' && <>
        {clientSecret
          ? <Pago clientSecret={clientSecret} transaccionId={id} />
          : <p className="text-sm text-gray-600">Esperando confirmación del pago…</p>}
        {import.meta.env.DEV && !clientSecret && <button className="w-full rounded-lg border border-dashed p-3 text-sm" onClick={accion(api.devPagar)}>[DEV] Simular pago</button>}
      </>}
      {!soyVendedor && tx.estado === 'en_escrow' && !tx.comprador_llego_at && <button className={btn} onClick={accion(api.llegue)}>He llegado</button>}
      {soyVendedor && tx.estado === 'en_escrow' && <button className={btn} onClick={accion(api.salgo)}>SALGO (liberar plaza)</button>}
      {tx.estado === 'liberada' && <p className="font-semibold text-green-700">✅ Plaza liberada. (Rating: próximamente)</p>}

      <div className="rounded-lg border bg-white p-2">
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {msgs.map((m) => (
            <p key={m.id} className={`w-fit max-w-[80%] rounded px-2 py-1 ${m.autor_id === user.id ? 'ml-auto bg-blue-100' : 'bg-gray-100'}`}>{m.texto}</p>
          ))}
          <div ref={fin} />
        </div>
        <form onSubmit={enviar} className="mt-2 flex gap-2">
          <input className="flex-1 rounded border p-2" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" maxLength={500} />
          <button className="rounded bg-blue-600 px-4 text-white">Enviar</button>
        </form>
      </div>
    </div>
  );
}
