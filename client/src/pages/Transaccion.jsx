import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Rating from '../components/Rating.jsx';
import Pago from '../components/Pago.jsx';
import Mapa from '../components/Mapa.jsx';
import { api } from '../services/api.js';
import { esIOS } from '../services/push.js';
import { onMensaje } from '../services/ws.js';

const rutaGoogle = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
const rutaApple = (lat, lng) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;

// Comprador: botón «¡Llévame!» (abre la navegación) y envío de su posición al vendedor mientras viene.
function Llevame({ id, lat, lng }) {
  const [compartir, setCompartir] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!compartir || !navigator.geolocation) return;
    let ultimo = 0, lock;
    const wid = navigator.geolocation.watchPosition(
      (p) => { setError(''); if (Date.now() - ultimo > 5000) { ultimo = Date.now(); api.enviarPosicion(id, p.coords.latitude, p.coords.longitude).catch(() => {}); } },
      () => setError('No puedo ver tu ubicación: activa el permiso de localización para que el vendedor te vea llegar.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});   // mantiene la pantalla encendida mientras se comparte
    return () => { navigator.geolocation.clearWatch(wid); lock?.release().catch(() => {}); };
  }, [compartir, id]);
  const ios = esIOS();
  return (
    <div className="space-y-2 rounded-xl border bg-white p-3">
      <a href={ios ? rutaApple(lat, lng) : rutaGoogle(lat, lng)} target="_blank" rel="noreferrer"
        className="block w-full rounded-xl bg-green-600 p-4 text-center text-lg font-bold text-white">🚗 ¡Llévame!</a>
      <p className="text-center text-xs text-gray-500">Abre {ios ? 'Apple Maps' : 'Google Maps'} · <a className="underline" href={ios ? rutaGoogle(lat, lng) : rutaApple(lat, lng)} target="_blank" rel="noreferrer">usar {ios ? 'Google Maps' : 'Apple Maps'}</a></p>
      <p className="text-sm text-gray-600">{compartir ? '📡 El vendedor ve por dónde vienes. Para que se actualice, vuelve a esta pantalla o mantenla abierta: al abrir el mapa externo el móvil puede pausar el seguimiento.' : 'No estás compartiendo tu posición con el vendedor.'}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => setCompartir(!compartir)} className="w-full rounded-lg border p-2 text-sm">{compartir ? 'Dejar de compartir mi posición' : 'Compartir mi posición'}</button>
    </div>);
}

// Vendedor: mapa con la plaza y el comprador, distancia y tiempo estimado (como Uber o Cabify).
function VieneAPlaza({ id }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    const cargar = () => api.seguimiento(id).then(setS).catch(() => {});
    cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [id]);
  if (!s?.activo) return null;
  const sinSenal = s.lat == null || s.segundos > 90;
  const markers = [{ id: 'p', lat: s.plaza_lat, lng: s.plaza_lng, label: 'P' }, ...(s.lat != null ? [{ id: 'c', lat: s.lat, lng: s.lng, label: '🚗', color: '#16a34a' }] : [])];
  return (
    <div className="space-y-2 rounded-xl border bg-white p-3">
      <p className="font-semibold">{s.llego ? '✅ El comprador ha llegado' : s.lat == null ? '⏳ Esperando a que el comprador comparta su posición…' : `🚗 Viene hacia tu plaza · a ${s.distancia_m} m · ~${s.eta_min} min`}</p>
      {s.lat != null && !s.llego && <p className="text-xs text-gray-500">{sinSenal ? `Última señal hace ${s.segundos < 120 ? `${s.segundos} s` : `${Math.round(s.segundos / 60)} min`}: puede que tenga la app en segundo plano.` : 'Actualizado en directo.'} El tiempo es aproximado.</p>}
      {s.lat != null && <Mapa center={{ lat: s.lat, lng: s.lng }} markers={markers} moverA={{ lat: s.lat, lng: s.lng, n: s.updated_at }} className="h-56 w-full overflow-hidden rounded-lg" />}
    </div>);
}

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
  const rapido = async (t) => { try { const m = await api.enviarChat(id, t); setMsgs((x) => [...x, m]); } catch (x) { setErr(x.message); } };

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    try { const m = await api.enviarChat(id, texto); setMsgs((x) => [...x, m]); setTexto(''); } catch (x) { setErr(x.message); }
  }

  if (!tx) return <p className="p-4">{err || 'Cargando…'}</p>;
  const soyVendedor = tx.vendedor_id === user.id;
  const btn = 'w-full rounded-lg bg-brand-600 p-3 font-semibold text-white';
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">{soyVendedor ? 'Tu venta' : 'Tu compra'} · {(tx.monto_cents / 100).toFixed(2).replace('.', ',')} €</h1>
      <p className="rounded bg-brand-50 p-2">Estado: <b>{ESTADOS[tx.estado] ?? tx.estado}</b></p>
      {err && <p className="text-red-600">{err}</p>}

      {!soyVendedor && tx.estado === 'en_escrow' && tx.lat && !tx.comprador_llego_at && <Llevame id={id} lat={tx.lat} lng={tx.lng} />}
      {soyVendedor && tx.estado === 'en_escrow' && <VieneAPlaza id={id} />}
      {!soyVendedor && tx.lat && <>
        <Mapa center={{ lat: tx.lat, lng: tx.lng }} markers={[{ id: 'p', lat: tx.lat, lng: tx.lng, label: 'P' }]} className="h-56 w-full" />
      </>}

      {tx.otro && (
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">{soyVendedor ? 'Quien viene a tu plaza' : 'Tu vendedor'} · {tx.otro.name}</p>
          <p className="text-lg font-bold">{tx.otro.modelo} · {tx.otro.color}</p>
          <p className="mt-1 inline-block rounded border-2 border-gray-800 bg-yellow-50 px-3 py-1 font-mono text-xl font-bold tracking-widest">{tx.otro.matricula}</p>
        </div>
      )}

      {!soyVendedor && tx.estado === 'pendiente_pago' && <>
        {clientSecret
          ? <Pago clientSecret={clientSecret} returnPath={`/transaccion/${id}`} />
          : <p className="text-sm text-gray-600">Esperando confirmación del pago…</p>}
        {import.meta.env.DEV && !clientSecret && <button className="w-full rounded-lg border border-dashed p-3 text-sm" onClick={accion(api.devPagar)}>[DEV] Simular pago</button>}
      </>}
      {!soyVendedor && tx.estado === 'en_escrow' && !tx.comprador_llego_at && <button className={btn} onClick={accion(api.llegue)}>He llegado</button>}
      {soyVendedor && tx.estado === 'en_escrow' && <button className={btn} onClick={accion(api.salgo)}>SALGO (liberar plaza)</button>}
      {!soyVendedor && tx.estado === 'en_escrow' && (
        <button className="w-full rounded-lg border border-red-300 p-3 text-red-700"
          onClick={() => { const m = prompt('¿Qué ha pasado? (p. ej. "No había plaza")'); if (m) api.disputa(id, m).then(cargar).catch((e) => setErr(e.message)); }}>
          Reportar problema</button>)}
      {tx.estado === 'disputada' && <p className="rounded bg-yellow-50 p-2">Problema reportado. Si no se resuelve en 24 h se reembolsa automáticamente.</p>}
      {tx.estado === 'reembolsada' && <p className="rounded bg-yellow-50 p-2">Importe reembolsado.</p>}
      {tx.estado === 'liberada' && <>
        <p className="font-semibold text-green-700">✅ Plaza liberada.</p>
        <Rating onSelect={(n) => api.rating(id, n).catch((e) => { setErr(e.message); throw e; })} />
      </>}

      <div className="rounded-lg border bg-white p-2">
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {msgs.map((m) => (
            <p key={m.id} className={`w-fit max-w-[80%] rounded px-2 py-1 ${m.autor_id === user.id ? 'ml-auto bg-brand-100' : 'bg-gray-100'}`}>{m.texto}</p>
          ))}
          <div ref={fin} />
        </div>
        {['pendiente_pago', 'en_escrow'].includes(tx.estado) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {['¡Estoy detrás de ti! 👀', 'Ya llego 🚶', '¿Cuánto te queda? ⏱️'].map((t) => (
              <button key={t} type="button" onClick={() => rapido(t)} className="rounded-full border bg-brand-50 px-3 py-1.5 text-sm text-brand-800">{t}</button>))}
          </div>)}
        <form onSubmit={enviar} className="mt-2 flex gap-2">
          <input className="flex-1 rounded border p-2" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" maxLength={500} />
          <button className="rounded bg-brand-600 px-4 text-white">Enviar</button>
        </form>
      </div>
    </div>
  );
}
