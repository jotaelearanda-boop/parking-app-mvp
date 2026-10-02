// Campos del coche: modelo, color y matrícula. `f` es el estado del formulario padre.
const COLORES = ['Blanco', 'Negro', 'Gris', 'Plata', 'Azul', 'Rojo', 'Verde', 'Amarillo', 'Naranja', 'Marrón', 'Otro'];

export default function CamposVehiculo({ f, set }) {
  const input = 'w-full rounded-lg border p-3';
  return (
    <>
      <input className={input} placeholder="Modelo (p. ej. BMW Serie 1)" value={f.vehiculo_modelo} onChange={set('vehiculo_modelo')} required minLength={2} />
      <select className={input} value={f.vehiculo_color} onChange={set('vehiculo_color')} required>
        <option value="">Color del coche</option>
        {COLORES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input className={`${input} uppercase`} placeholder="Matrícula (p. ej. 0000XXX)" value={f.vehiculo_matricula} onChange={set('vehiculo_matricula')} required minLength={4} maxLength={12} />
    </>
  );
}
