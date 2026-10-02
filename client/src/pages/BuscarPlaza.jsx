import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Mapa from '../components/Mapa.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../services/api.js';
import { ZONA_PILOTO } from '../services/geolocation.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';

export default function BuscarPlaza() {
  const [plazas, setPlazas] = useState([]);
  const [sel, setSel] = useState(null);
  const [precioMax, setPrecioMax] = useState('');
  const aviso = useToast();
  const [saldo, setSaldo] = useState(0);
  useEffect(() => { api.saldo().then((r) => setSaldo(r.saldo_cents)).catch(() => {}); }, []);
  const nav = useNavigate();
  const reservar = (conSaldo) => api.reservar(sel.id, conSaldo)
    .then((t) => nav(`/transaccion/${t.id}`, { state: { clientSecret: t.client_secret } }))
    .catch((e) => { aviso(e.message, 'error'); setSel(null); });

  useEffect(() => {
    const cargar = () => api.plazasCerca({
      lat: ZONA_PILOTO.lat, lng: ZONA_PILOTO.lng, radio: 1000, ...(precioMax && { precio_max: Math.round(precioMax * 100) }),
    }).then((r) => { setPlazas(r.plazas); setSel((c) => (c && r.plazas.some((p) => p.id === c.id) ? c : null)); }).catch(() => {});
    cargar();
    const id = setInterval(cargar, 5000); // refresco cada 5 s
    return () => clearInterval(id);
  }, [precioMax]);

  return (
    <div>
      <div className="flex items-center gap-2 p-3">
        <span className="font-semibold">Zona: {ZONA_PILOTO.nombre}</span>
        <input className="ml-auto w-28 rounded border p-1" type="number" step="0.10" placeholder="Precio máx €" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />
      </div>
      <Mapa center={ZONA_PILOTO}
        markers={plazas.map((p) => ({ id: p.id, lat: Number(p.lat_aprox), lng: Number(p.lng_aprox), label: String(p.precio_cents / 100), ...p }))}
        onMarkerClick={(m) => setSel(plazas.find((p) => p.id === m.id))} />
      {sel && (
        <div className="space-y-1 border-t bg-white p-4">
          <p className="text-lg font-bold">{eur(sel.precio_cents)} · {sel.tiempo_indicado ? `${sel.minutos_restantes} min restantes` : 'tiempo no indicado'}</p>
          <p>A {sel.distancia_m} m · {sel.vendedor} ★ {Number(sel.rating_avg).toFixed(1)} ({sel.rating_count})</p>
          {saldo >= sel.precio_cents && (
            <button onClick={() => reservar(true)} className="mt-2 w-full rounded-lg bg-blue-600 p-3 font-semibold text-white">Reservar y pagar con saldo ({eur(saldo)})</button>
          )}
          <button onClick={() => reservar(false)} className={`mt-2 w-full rounded-lg p-3 font-semibold ${saldo >= sel.precio_cents ? 'border' : 'bg-blue-600 text-white'}`}>
            Reservar y pagar con tarjeta / Apple Pay
          </button>
        </div>
      )}
      {!plazas.length && <p className="p-4 text-gray-500">No hay plazas disponibles ahora mismo.</p>}
    </div>
  );
}
