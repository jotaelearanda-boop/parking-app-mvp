import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

const SCRIPT = 'https://accounts.google.com/gsi/client';
const cargarScript = () => new Promise((ok, fail) => {
  if (window.google?.accounts?.id) return ok();
  const s = document.querySelector(`script[src="${SCRIPT}"]`) ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true });
  s.addEventListener('load', ok); s.addEventListener('error', fail);
  if (!s.isConnected) document.head.appendChild(s);
});

// Botón oficial «Continuar con Google». No se muestra si el servidor no tiene configurado el acceso con Google.
export default function GoogleBoton({ onCredential }) {
  const caja = useRef();
  const [clientId, setClientId] = useState(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  useEffect(() => { api.googleConfig().then((r) => setClientId(r.clientId)).catch(() => {}); }, []);
  useEffect(() => {
    if (!clientId) return;
    let vivo = true;
    cargarScript().then(() => {
      if (!vivo || !caja.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential), ux_mode: 'popup' });
      window.google.accounts.id.renderButton(caja.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(320, caja.current.clientWidth || 320), locale: 'es' });
    }).catch(() => {});
    return () => { vivo = false; };
  }, [clientId]);
  if (!clientId) return null;
  return <div className="flex justify-center"><div ref={caja} className="w-full max-w-xs" /></div>;
}
