// Desplegable para elegir con qué coche se vende o se reserva. Solo se muestra si hay más de uno.
export default function SelectorCoche({ coches, value, onChange, etiqueta = 'Coche' }) {
  if (!coches || coches.length < 2) return null;
  return (
    <label className="block text-sm">{etiqueta}
      <select className="mt-1 w-full rounded-lg border bg-white p-2.5" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {coches.map((c) => <option key={c.id} value={c.id}>{c.modelo} · {c.color} · {c.matricula}</option>)}
      </select>
    </label>);
}
