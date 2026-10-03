import { useEffect, useRef, useState } from 'react';
import SelectorCoche from '../components/SelectorCoche.jsx';
import Mapa from '../components/Mapa.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../services/api.js';
import { posicionActual } from '../services/geolocation.js';

// Flujo "Vender mi plaza": localiza, deja ajustar el pin, pide el precio y publica. La plaza no caduca.
export default function VenderPlaza({ onPublicada, inicio = null }) {
  const aviso = useToast();
  const [pos, setPos] = useState(null);
  const [moverA, setMoverA] = useState(null);
  const pinRef = useRef(null);            // posición del pin = centro del mapa (se mueve arrastrando)
  const [precio, setPrecio] = useState('1.50');
  const [enviando, setEnviando] = useState(false);
  const [coches, setCoches] = useState([]);
  const [cocheId, setCocheId] = useState('');
  useEffect(() => { api.vehiculos().then((r) => { setCoches(r.vehiculos); setCocheId(r.vehiculos.find((c) => c.principal)?.id ?? ''); }).catch(() => {}); }, []);

  // Si ya sabemos dónde está el coche (plaza ocupada) se parte de ahí; si no, del GPS.
  const aparcado = () => (inicio ? Promise.resolve(inicio) : posicionActual()).then((p) => { pinRef.current = p; setPos(p); }).catch((e) => aviso(
    e.code === 1
      ? 'Necesitamos tu ubicación. En el iPhone: icono a la izquierda de la dirección en Safari → Ajustes del sitio web → Ubicación → Permitir.'
      : e.code === 3 ? 'Tardó demasiado en localizarte. Prueba en un sitio con mejor cobertura.'
      : 'No pude obtener tu ubicación. Comprueba que la localización está activada.', 'error'));

  async function publicar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const { lat, lng } = pinRef.current ?? pos;
      await api.publicarPlaza({ lat, lng, precio_cents: Math.round(Number(precio.replace(',', '.')) * 100), ...(cocheId && { vehiculo_id: cocheId }) });
      aviso('Plaza publicada', 'ok');
      setPos(null);
      onPublicada?.();
    } catch (x) { aviso(x.message, 'error'); }
    setEnviando(false);
  }

  if (!pos) return (
    <>
    <button onClick={aparcado} className="w-full rounded-xl bg-blue-600 p-5 text-lg font-bold text-white">
      📍 Vender mi plaza
    </button>
    <p className="mt-2 text-xs text-gray-500">Tu plaza seguirá publicada hasta que alguien la reserve o la canceles. Usaremos tu ubicación solo para publicarla. Se borra 1 hora después de cerrar la venta.</p>
    </>);

  return (
    <form onSubmit={publicar} className="space-y-3 rounded-xl border bg-white">
      <div className="relative">
        <Mapa center={pos} centerPin className="h-[42vh] w-full overflow-hidden rounded-t-xl" moverA={moverA}
          onCenterChange={(c) => { pinRef.current = { lat: c.lat, lng: c.lng }; }} />
        <p className="pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-center text-sm shadow">
          Mueve el mapa para colocar el pin donde está tu coche
        </p>
        <button type="button" onClick={() => posicionActual().then((p) => { pinRef.current = p; setMoverA({ ...p, n: Date.now() }); }).catch(() => {})}
          className="absolute bottom-3 right-3 rounded-full bg-white px-3 py-2 text-sm font-semibold shadow-md">📍 Mi ubicación</button>
      </div>
      <div className="space-y-3 p-4">
        <SelectorCoche coches={coches} value={cocheId} onChange={setCocheId} etiqueta="Coche con el que vendes" />
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
