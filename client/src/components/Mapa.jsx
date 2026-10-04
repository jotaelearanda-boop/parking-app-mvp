import { useEffect } from 'react';
import { APIProvider, AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps';

// Pinta las zonas bloqueadas (azul/naranja) como polígonos semitransparentes.
function Zonas({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.data.forEach((f) => map.data.remove(f));
    if (geojson?.features?.length) map.data.addGeoJson(geojson);
    map.data.setStyle((f) => {
      const c = f.getProperty('tipo') === 'naranja' ? '#f97316' : '#2563eb';
      return { fillColor: c, fillOpacity: 0.28, strokeColor: c, strokeWeight: 1, clickable: false };
    });
  }, [map, geojson]);
  return null;
}

// Mueve el mapa a una posición cuando cambia `a` (p. ej. al pulsar "Mi ubicación").
function Mover({ a }) {
  const map = useMap();
  useEffect(() => { if (map && a) { map.panTo({ lat: a.lat, lng: a.lng }); map.setZoom(Math.max(map.getZoom() ?? 0, 17)); } }, [map, a]);
  return null;
}

const PinCentral = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="#dc2626" stroke="#fff" strokeWidth="1.4" className="drop-shadow-md">
    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none" />
  </svg>
);

/**
 * Mapa interactivo (se puede arrastrar y hacer zoom).
 * - center: posición inicial (el usuario lo mueve libremente después).
 * - centerPin: muestra un pin fijo en el centro; onCenterChange recibe el centro al mover.
 * - markers: [{id, lat, lng, label?, color?}], zonas: GeoJSON de zonas bloqueadas, moverA: {lat,lng} para recentrar, limites: {north,south,east,west} fuera de los cuales no se puede mover el mapa.
 */
export default function Mapa({ center, markers = [], onMarkerClick, onMapClick, onCenterChange, centerPin = false, zonas, moverA, limites, className = 'h-[60vh] w-full' }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key) return <p className="p-4 text-red-600">Falta VITE_GOOGLE_MAPS_KEY en client/.env.local</p>;
  return (
    <div className={`relative ${className}`}>
      <APIProvider apiKey={key}>
        <Map className="h-full w-full" defaultCenter={center} defaultZoom={17} mapId="DEMO_MAP_ID" gestureHandling="greedy" restriction={limites ? { latLngBounds: limites, strictBounds: true } : undefined}
          streetViewControl={false} mapTypeControl={false} fullscreenControl={false} clickableIcons={false}
          onClick={() => onMapClick?.()}
          onCameraChanged={(ev) => onCenterChange?.(ev.detail.center)}>
          {markers.map((m) => (
            <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={() => onMarkerClick?.(m)}>
              <Pin background={m.color ?? '#0e8277'} glyphColor="#fff" glyph={m.label} />
            </AdvancedMarker>
          ))}
          <Zonas geojson={zonas} />
          <Mover a={moverA} />
        </Map>
      </APIProvider>
      {centerPin && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"><PinCentral /></div>}
    </div>
  );
}
