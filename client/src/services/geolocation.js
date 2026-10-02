// Zona piloto: Calle Aloná, Alicante (hardcoded al inicio).
export const ZONA_PILOTO = { nombre: 'Aloná', lat: 38.3452, lng: -0.4810 };

export const posicionActual = () =>
  new Promise((ok, fail) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), fail,
          { enableHighAccuracy: true, timeout: 10000 })
      : fail(new Error('Geolocalización no disponible')));

// Llama a cb(pos) cada intervalMs; devuelve función para parar.
export function seguirPosicion(cb, intervalMs) {
  const tick = () => posicionActual().then(cb).catch(() => {});
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
