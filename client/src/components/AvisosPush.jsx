import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast.jsx';
import { api } from '../services/api.js';
import { activarPush, desactivarPush, estadoPush } from '../services/push.js';

// Tarjeta para activar/desactivar los avisos push. En iPhone hay que instalar la app primero.
export default function AvisosPush({ soloSiInactivo = false }) {
  const aviso = useToast();
  const [estado, setEstado] = useState(null);
  const cargar = useCallback(() => estadoPush().then(setEstado).catch(() => setEstado('no-soportado')), []);
  useEffect(() => { cargar(); }, [cargar]);

  const activar = () => activarPush().then(() => { aviso('Avisos activados', 'ok'); cargar(); }).catch((e) => aviso(e.message, 'error'));
  const desactivar = () => desactivarPush().then(() => { aviso('Avisos desactivados', 'ok'); cargar(); });
  const prueba = () => api.pushPrueba().then(() => aviso('Enviada: debería llegarte ahora', 'ok')).catch((e) => aviso(e.message, 'error'));

  if (!estado || (soloSiInactivo && estado === 'activo')) return null;
  const caja = 'rounded-xl border bg-white p-4';
  if (estado === 'instalar') return (
    <div className={caja}>
      <p className="font-semibold">🔔 Avisos de plazas y reservas</p>
      <p className="mt-1 text-sm text-gray-600">En iPhone hay que instalar la app para recibirlos: toca <b>Compartir</b> (el cuadrado con la flecha) y luego <b>Añadir a pantalla de inicio</b>. Ábrela desde ese icono y vuelve aquí.</p>
    </div>);
  if (estado === 'no-soportado') return <div className={caja}><p className="text-sm text-gray-600">🔔 Este navegador no admite avisos. Prueba con Safari (iPhone, app instalada) o Chrome (Android).</p></div>;
  if (estado === 'bloqueado') return <div className={caja}><p className="text-sm text-gray-600">🔔 Has bloqueado las notificaciones de esta app. Actívalas en los ajustes del navegador o del móvil para recibir avisos.</p></div>;
  if (estado === 'activo') return (
    <div className={caja}>
      <p className="font-semibold">🔔 Avisos activados</p>
      <div className="mt-2 flex gap-2">
        <button onClick={prueba} className="flex-1 rounded-lg border p-2 text-sm">Enviar prueba</button>
        <button onClick={desactivar} className="flex-1 rounded-lg border p-2 text-sm text-gray-600">Desactivar</button>
      </div>
    </div>);
  return (
    <div className={caja}>
      <p className="font-semibold">🔔 Activa los avisos</p>
      <p className="mt-1 text-sm text-gray-600">Te avisamos cuando alguien reserve tu plaza, cuando aparezca una plaza cerca si estás buscando, y te recordamos venderla cuando te vayas. Solo lo importante.</p>
      <button onClick={activar} className="mt-2 w-full rounded-lg bg-blue-600 p-3 font-semibold text-white">Activar avisos</button>
    </div>);
}
