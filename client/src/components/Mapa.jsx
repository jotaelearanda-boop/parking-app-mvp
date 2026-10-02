import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

// markers: [{id, lat, lng, label?, color?}]
export default function Mapa({ center, markers = [], onMarkerClick, className = 'h-[60vh] w-full' }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key) return <p className="p-4 text-red-600">Falta VITE_GOOGLE_MAPS_KEY en client/.env.local</p>;
  return (
    <APIProvider apiKey={key}>
      <Map className={className} center={center} defaultZoom={17} mapId="DEMO_MAP_ID" gestureHandling="greedy" disableDefaultUI>
        {markers.map((m) => (
          <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={() => onMarkerClick?.(m)}>
            <Pin background={m.color ?? '#2563eb'} glyphColor="#fff" glyph={m.label} />
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}
