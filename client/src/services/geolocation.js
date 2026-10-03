// Zona piloto: Benalúa, Alicante (calle Aloná y calle García Andreu).
export const ZONA_PILOTO = { nombre: 'Benalúa', lat: 38.3414, lng: -0.4963 };

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

// Distancia en metros entre dos puntos (fórmula de haversine).
export function distanciaM(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
