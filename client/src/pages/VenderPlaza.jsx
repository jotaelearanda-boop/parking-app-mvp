import { useState } from 'react';
import Mapa from '../components/Mapa.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../services/api.js';
import { posicionActual } from '../services/geolocation.js';

// Flujo "Acabo de aparcar": localiza, pide precio (y tiempo, opcional) y publica la plaza.
export default function VenderPlaza({ onPublicada }) {
  const aviso = useToast();
  const [pos, setPos] = useState(null);
  const [tiempo, setTiempo] = useState('');            // '' = sin indicar
  const [precio, setPrecio] = useState('1.50');
  const [enviando, setEnviando] = useState(false);

  const aparcado = () => posicionActual().then(setPos).catch((e) => aviso(
    e.code === 1
      ? 'Necesitamos tu ubicación. En el iPhone: icono a la izquierda de la dirección en Safari → Ajustes del sitio web → Ubicación → Permitir.'
      : e.code === 3 ? 'Tardó demasiado en localizarte. Prueba en un sitio con mejor cobertura.'
      : 'No pude obtener tu ubicación. Comprueba que la localización está activada.', 'error'));

  async function publicar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.publicarPlaza({ lat: pos.lat, lng: pos.lng, ...(tiempo && { tiempo_min: Number(tiempo) }), precio_cents: Math.round(Number(precio.replace(',', '.')) * 100) });
      aviso('Plaza publicada', 'ok');
      setPos(null);
      onPublicada?.();
    } catch (x) { aviso(x.message, 'error'); }
    setEnviando(false);
  }

  if (!pos) return (
    <button onClick={aparcado} className="w-full rounded-xl bg-blue-600 p-5 text-lg font-bold text-white">
      📍 Vender mi plaza
    </button>);

  return (
    <form onSubmit={publicar} className="space-y-3 rounded-xl border bg-white">
      <Mapa center={pos} markers={[{ id: 'yo', ...pos, label: 'P' }]} className="h-[32vh] w-full rounded-t-xl" />
      <div className="space-y-3 p-4">
        <label className="block">¿Cuánto tiempo te quedas? <span className="text-sm text-gray-500">(opcional)</span>
          <select className="mt-1 w-full rounded border p-2" value={tiempo} onChange={(e) => setTiempo(e.target.value)}>
            <option value="">Sin indicar</option>
            <option value="30">30 min</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="240">4 horas</option>
          </select></label>
        <label className="block">Precio (€)
          <input className="mt-1 w-full rounded border p-2" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" /></label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPos(null)} className="flex-1 rounded-lg border p-3">Cancelar</button>
          <button disabled={enviando} className="flex-[2] rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300">Publicar plaza</button>
        </div>
      </div>
    </form>
  );
}
