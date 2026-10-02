import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Mapa from '../components/Mapa.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../services/api.js';
import { ZONA_PILOTO, distanciaM, posicionActual } from '../services/geolocation.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';

export default function BuscarPlaza() {
  const aviso = useToast();
  const nav = useNavigate();
  const [plazas, setPlazas] = useState([]);
  const [sel, setSel] = useState(null);
  const [precioMax, setPrecioMax] = useState('');
  const [saldo, setSaldo] = useState(0);
  const [zonas, setZonas] = useState(null);
  const [centro, setCentro] = useState(ZONA_PILOTO);   // centro del mapa: se actualiza al moverlo
  const [miPos, setMiPos] = useState(null);
  const [moverA, setMoverA] = useState(null);
  const [reservando, setReservando] = useState(false);
  const temporizador = useRef();

  useEffect(() => { api.saldo().then((r) => setSaldo(r.saldo_cents)).catch(() => {}); api.zonas().then(setZonas).catch(() => {}); }, []);

  // Busca plazas alrededor del centro del mapa (se refresca cada 5 s y al mover el mapa).
  useEffect(() => {
    const cargar = () => api.plazasCerca({
      lat: centro.lat, lng: centro.lng, radio: 1000, ...(precioMax && { precio_max: Math.round(precioMax * 100) }),
    }).then((r) => { setPlazas(r.plazas); setSel((c) => (c && r.plazas.some((p) => p.id === c.id) ? c : null)); }).catch(() => {});
    cargar();
    const id = setInterval(cargar, 5000);
    return () => clearInterval(id);
  }, [centro, precioMax]);

  const alMoverMapa = (c) => { clearTimeout(temporizador.current); temporizador.current = setTimeout(() => setCentro({ lat: c.lat, lng: c.lng }), 500); };
  const irAMiPos = () => posicionActual()
    .then((p) => { setMiPos(p); setMoverA({ ...p, n: Date.now() }); })
    .catch(() => aviso('No pude obtener tu ubicación. Revisa el permiso de localización del navegador.', 'error'));

  const reservar = async (conSaldo) => {
    setReservando(true);
    try {
      const t = await api.reservar(sel.id, conSaldo);
      nav(`/transaccion/${t.id}`, { state: { clientSecret: t.client_secret } });
    } catch (e) { aviso(e.message, 'error'); setSel(null); }
    setReservando(false);
  };

  const distancia = sel && miPos ? distanciaM(miPos, { lat: Number(sel.lat_aprox), lng: Number(sel.lng_aprox) }) : null;
  const puedeSaldo = sel && saldo >= sel.precio_cents;

  return (
    <div>
      <div className="flex items-center gap-2 p-3">
        <span className="text-sm font-semibold leading-tight">Zona: {ZONA_PILOTO.nombre}</span>
        <input className="ml-auto w-28 rounded border p-1" type="number" step="0.10" placeholder="Precio máx €" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />
      </div>

      <div className="relative">
        <Mapa center={ZONA_PILOTO} className="h-[calc(100dvh-9rem)] min-h-[320px] w-full" zonas={zonas} moverA={moverA}
          markers={plazas.map((p) => ({ id: p.id, lat: Number(p.lat_aprox), lng: Number(p.lng_aprox), label: String(p.precio_cents / 100), ...p }))}
          onMarkerClick={(m) => setSel(plazas.find((p) => p.id === m.id))} onMapClick={() => setSel(null)} onCenterChange={alMoverMapa} />
        <button onClick={irAMiPos} aria-label="Mi ubicación" className="absolute right-3 top-3 rounded-full bg-white px-3 py-2 text-sm font-semibold shadow-md">📍 Mi ubicación</button>
        {!plazas.length && <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-white/95 px-4 py-2 text-sm text-gray-600 shadow">No hay plazas disponibles en esta zona ahora mismo</p>}
      </div>

      {/* Hoja inferior: sube desde abajo tapando parte del mapa */}
      {sel && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl animate-[slideUp_.25s_ease-out] rounded-t-2xl bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,.2)]">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" />
          <button onClick={() => setSel(null)} aria-label="Cerrar" className="absolute right-4 top-4 text-2xl leading-none text-gray-400">×</button>
          <p className="text-2xl font-bold">{eur(sel.precio_cents)}</p>
          <p className="text-gray-600">
            {sel.tiempo_indicado ? `${sel.minutos_restantes} min restantes` : 'Tiempo no indicado'}
            {distancia != null && ` · a ${distancia} m de ti`} · {sel.vendedor} ★ {Number(sel.rating_avg).toFixed(1)} ({sel.rating_count})
          </p>
          <div className="mt-3 space-y-2">
            {puedeSaldo && (
              <button disabled={reservando} onClick={() => reservar(true)} className="w-full rounded-xl bg-blue-600 p-3.5 font-semibold text-white disabled:bg-gray-300">
                Pagar con saldo · {eur(sel.precio_cents)} <span className="font-normal opacity-80">(tienes {eur(saldo)})</span>
              </button>)}
            <button disabled={reservando} onClick={() => reservar(false)}
              className={`w-full rounded-xl p-3.5 font-semibold disabled:opacity-50 ${puedeSaldo ? 'border' : 'bg-blue-600 text-white'}`}>
              {puedeSaldo ? 'Pagar con tarjeta / Apple Pay' : `Pagar ${eur(sel.precio_cents)} · tarjeta / Apple Pay`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
