import { useState } from 'react';
import Mapa from '../components/Mapa.jsx';
import { api } from '../services/api.js';
import { posicionActual } from '../services/geolocation.js';

export default function VenderPlaza() {
  const [pos, setPos] = useState(null);
  const [tiempo, setTiempo] = useState(60);
  const [precio, setPrecio] = useState('1.50');
  const [foto, setFoto] = useState(null);
  const [msg, setMsg] = useState('');
  const [plazaId, setPlazaId] = useState(null);

  const aparcado = () => posicionActual().then(setPos).catch((e) => setMsg('No pude obtener tu ubicación: ' + e.message));

  async function publicar(e) {
    e.preventDefault(); setMsg('');
    const fd = new FormData();
    fd.append('lat', pos.lat); fd.append('lng', pos.lng); fd.append('tiempo_min', tiempo);
    fd.append('precio_cents', Math.round(Number(precio.replace(',', '.')) * 100)); fd.append('foto', foto);
    try { const r = await api.publicarPlaza(fd); setPlazaId(r.id); setMsg('Plaza publicada ✅'); }
    catch (x) { setMsg(x.message); }
  }

  if (!pos) return (
    <div className="p-4">
      <button onClick={aparcado} className="w-full rounded-xl bg-blue-600 p-6 text-xl font-bold text-white">ACABO DE APARCAR</button>
      {msg && <p className="mt-3 text-red-600">{msg}</p>}
    </div>);

  return (
    <form onSubmit={publicar} className="space-y-3">
      <Mapa center={pos} markers={[{ id: 'yo', ...pos, label: 'P' }]} className="h-[40vh] w-full" />
      <div className="space-y-3 p-4">
        <label className="block">¿Cuánto tiempo te quedas?
          <select className="mt-1 w-full rounded border p-2" value={tiempo} onChange={(e) => setTiempo(Number(e.target.value))}>
            <option value={30}>30 min</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option>
          </select></label>
        <label className="block">Precio (€)
          <input className="mt-1 w-full rounded border p-2" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" /></label>
        <label className="block">Foto de la matrícula (obligatoria)
          <input className="mt-1 w-full" type="file" accept="image/*" capture="environment" required onChange={(e) => setFoto(e.target.files[0])} /></label>
        <button disabled={!!plazaId} className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300">PUBLICAR</button>
        {plazaId && <button type="button" className="w-full rounded-lg border p-3" onClick={() => api.cancelarPlaza(plazaId).then(() => { setPlazaId(null); setPos(null); setMsg(''); })}>Cancelar plaza</button>}
        {msg && <p>{msg}</p>}
      </div>
    </form>
  );
}
