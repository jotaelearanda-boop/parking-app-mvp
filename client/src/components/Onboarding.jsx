import { useState } from 'react';
import { activarPush, estadoPush } from '../services/push.js';

const PASOS = [
  { icono: '🚗', titulo: 'Bienvenido a APParK', texto: 'Conectamos a quien deja una plaza libre en la calle con quien está llegando. Te lo explicamos en 3 pasos.',
    extra: 'coche' },
  { icono: '🔍', titulo: 'Si buscas plaza', puntos: [
    'En «Buscar» mueve el mapa: verás las plazas libres cerca con su precio.',
    'Pulsa «Búscame» y te avisamos si aparece una plaza a menos de 600 m durante 1 hora.',
    'Toca una plaza, paga con saldo o tarjeta y pulsa «¡Llévame!» para llegar con el mapa.',
    'El vendedor te ve venir y, cuando se va, la plaza es tuya.'] },
  { icono: '🅿️', titulo: 'Si te vas y dejas una plaza', puntos: [
    'En «Mis coches» pulsa «Vender mi plaza» justo antes de salir y coloca el pin donde está tu coche.',
    'Tu plaza estará visible 10 minutos, por si alguien más la ocupa. Si caduca, puedes renovarla con un toque.',
    'Cuando alguien la reserve y pague, ves cómo se acerca. Al salir pulsa «SALGO» y recibes el dinero en tu saldo (menos el 20 % de la plataforma).'] },
  { icono: '🔔', titulo: 'Activa los avisos', texto: 'Así sabrás al momento si alguien reserva tu plaza o si aparece una cerca de ti.',
    extra: 'avisos', beta: 'Estamos en beta: los pagos son de prueba. Usa la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC.' },
];

// Guía de bienvenida: se enseña una vez por persona (y se puede volver a abrir desde Mi cuenta).
export default function Onboarding({ onCerrar, onIrCoche }) {
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const p = PASOS[i], ultimo = i === PASOS.length - 1;
  const avisos = async () => {
    const est = await estadoPush().catch(() => 'no-soportado');
    if (est === 'activo') return setMsg('Ya tienes los avisos activados ✅');
    if (est === 'instalar') return setMsg('En iPhone instala primero la app: Compartir → Añadir a pantalla de inicio. Luego actívalos en Mi cuenta → Avisos.');
    if (est !== 'inactivo') return setMsg('Este navegador no permite avisos. Puedes revisarlo luego en Mi cuenta.');
    try { await activarPush(); setMsg('Avisos activados ✅'); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Guía de bienvenida">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>{PASOS.map((_, k) => <span key={k} className={`h-1.5 w-6 rounded-full ${k <= i ? 'bg-brand-600' : 'bg-gray-200'}`} />)}</div>
          <button onClick={onCerrar} className="text-sm text-gray-500">Saltar</button>
        </div>
        <p className="text-4xl">{p.icono}</p>
        <h2 className="text-xl font-bold">{p.titulo}</h2>
        {p.texto && <p className="text-gray-700">{p.texto}</p>}
        {p.puntos && <ul className="space-y-2 text-sm text-gray-700">{p.puntos.map((t) => <li key={t} className="flex gap-2"><span className="text-brand-600">•</span><span>{t}</span></li>)}</ul>}
        {p.extra === 'coche' && (
          <div className="space-y-2 rounded-xl bg-brand-50 p-3 text-sm">
            <p><b>Primero, tu coche.</b> Lo pediste al registrarte; el comprador o vendedor lo verá solo tras pagar, para reconoceros en la calle. Revisa que modelo, color y matrícula son correctos, y añade otros coches si tienes.</p>
            <button onClick={onIrCoche} className="w-full rounded-lg bg-brand-600 p-2.5 font-semibold text-white">Revisar mi coche</button>
          </div>)}
        {p.extra === 'avisos' && <button onClick={avisos} className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white">Activar avisos</button>}
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
        {p.beta && <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-900">{p.beta}</p>}
        <div className="flex gap-2 pt-1">
          {i > 0 && <button onClick={() => { setI(i - 1); setMsg(''); }} className="flex-1 rounded-lg border p-3">Atrás</button>}
          <button onClick={() => (ultimo ? onCerrar() : (setI(i + 1), setMsg('')))} className="flex-[2] rounded-lg bg-gray-900 p-3 font-semibold text-white">{ultimo ? 'Empezar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>);
}
