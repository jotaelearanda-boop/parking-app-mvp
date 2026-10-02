import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';

export default function Admin() {
  const [r, setR] = useState(null);
  const [disp, setDisp] = useState([]);
  const [err, setErr] = useState('');
  const cargar = useCallback(() => {
    api.adminResumen().then(setR).catch((e) => setErr(e.message));
    api.adminDisputas().then((x) => setDisp(x.disputas)).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const resolver = (id, accion) => api.adminResolver(id, accion).then(cargar).catch((e) => setErr(e.message));

  if (err && !r) return <p className="p-4 text-red-600">{err}</p>;
  if (!r) return <p className="p-4">Cargando…</p>;
  const K = ({ t, v }) => <div className="rounded-lg border bg-white p-3"><p className="text-xs text-gray-500">{t}</p><p className="text-xl font-bold">{v}</p></div>;
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Admin</h1>
      {err && <p className="text-red-600">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <K t="Transacciones hoy" v={r.hoy.n} /><K t="Comisión hoy" v={eur(r.hoy.comision)} />
        <K t="Comisión total" v={eur(r.total.comision)} /><K t="Usuarios (7 d)" v={`${r.usuarios.total} (${r.usuarios.ult7})`} />
        <K t="Plazas hoy" v={r.plazas_hoy} /><K t="Rating medio" v={r.rating_medio} />
      </div>
      <h2 className="pt-2 font-semibold">Disputas ({r.disputas_abiertas} abiertas)</h2>
      {disp.map((d) => (
        <div key={d.id} className="space-y-1 rounded-lg border bg-white p-3">
          <p><b>{d.comprador}</b> vs <b>{d.vendedor}</b> · {eur(d.monto_cents)} · {d.estado}</p>
          <p className="text-sm text-gray-600">“{d.motivo}”</p>
          {d.estado === 'abierta' && <div className="flex gap-2">
            <button onClick={() => resolver(d.id, 'reembolsar')} className="flex-1 rounded bg-red-600 p-2 text-white">Reembolsar</button>
            <button onClick={() => resolver(d.id, 'pagar')} className="flex-1 rounded bg-green-600 p-2 text-white">Pagar al vendedor</button>
          </div>}
        </div>
      ))}
    </div>
  );
}
