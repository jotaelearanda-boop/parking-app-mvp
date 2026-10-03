import { useEffect, useState } from 'react';
import CamposVehiculo from './CamposVehiculo.jsx';
import { IconoCoche } from './Iconos.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../services/api.js';

const MAX = 5;
const VACIO = { vehiculo_modelo: '', vehiculo_color: '', vehiculo_matricula: '' };

// Lista de coches del usuario: añadir, editar, marcar como principal y borrar.
export default function Coches() {
  const aviso = useToast();
  const [coches, setCoches] = useState(null);
  const [edit, setEdit] = useState(null);      // null | 'nuevo' | id
  const [f, setF] = useState(VACIO);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { api.vehiculos().then((r) => setCoches(r.vehiculos)).catch(() => setCoches([])); }, []);

  const abrir = (c) => { setF(c ? { vehiculo_modelo: c.modelo, vehiculo_color: c.color, vehiculo_matricula: c.matricula } : VACIO); setEdit(c ? c.id : 'nuevo'); };
  const guardar = (e) => {
    e.preventDefault();
    const body = { modelo: f.vehiculo_modelo, color: f.vehiculo_color, matricula: f.vehiculo_matricula };
    (edit === 'nuevo' ? api.crearVehiculo(body) : api.editarVehiculo(edit, body))
      .then((r) => { setCoches(r.vehiculos); setEdit(null); aviso('Coche guardado', 'ok'); })
      .catch((x) => aviso(x.message, 'error'));
  };
  const accion = (p, ok) => p.then((r) => { setCoches(r.vehiculos); aviso(ok, 'ok'); }).catch((x) => aviso(x.message, 'error'));
  const borrar = (c) => confirm(`¿Quitar ${c.modelo} (${c.matricula})?`) && accion(api.borrarVehiculo(c.id), 'Coche eliminado');

  if (!coches) return <p className="text-gray-500">Cargando…</p>;
  if (edit) return (
    <form onSubmit={guardar} className="space-y-2 rounded-xl border bg-white p-4">
      <p className="font-semibold">{edit === 'nuevo' ? 'Añadir coche' : 'Editar coche'}</p>
      <CamposVehiculo f={f} set={set} />
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-lg border p-2" onClick={() => setEdit(null)}>Cancelar</button>
        <button className="flex-[2] rounded-lg bg-blue-600 p-2 font-semibold text-white">Guardar</button>
      </div>
    </form>);
  return (
    <div className="space-y-2">
      {coches.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-white p-4">
          <div className="text-blue-600"><IconoCoche /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c.modelo} · {c.color} {c.principal && <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Principal</span>}</p>
            <p className="mt-1 inline-block rounded border-2 border-gray-800 bg-yellow-50 px-2 font-mono font-bold tracking-widest">{c.matricula}</p>
            <div className="mt-1 flex gap-4 text-sm">
              <button className="text-blue-600" onClick={() => abrir(c)}>Editar</button>
              {!c.principal && <button className="text-blue-600" onClick={() => accion(api.vehiculoPrincipal(c.id), 'Coche principal cambiado')}>Hacer principal</button>}
              {coches.length > 1 && <button className="text-red-600" onClick={() => borrar(c)}>Quitar</button>}
            </div>
          </div>
        </div>))}
      {coches.length < MAX && <button onClick={() => abrir(null)} className="w-full rounded-xl border border-dashed bg-white p-3 font-semibold text-blue-600">+ Añadir otro coche</button>}
    </div>);
}
