// Cliente HTTP del backend. El token JWT vive en localStorage (MVP).
export const getToken = () => localStorage.getItem('token');
export const setSession = (token) => token ? localStorage.setItem('token', token) : localStorage.removeItem('token');

// En producción VITE_API_URL apunta al backend (Railway); en local se usa el proxy de Vite.
export const API_URL = import.meta.env.VITE_API_URL ?? '';

async function req(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api${path}`, { method, headers, body: form ?? (body && JSON.stringify(body)) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { codigo: data.codigo });
  return data;
}

export const api = {
  registro: (b) => req('/auth/registro', { method: 'POST', body: b }),
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  vehiculos: () => req('/vehiculos'),
  crearVehiculo: (b) => req('/vehiculos', { method: 'POST', body: b }),
  editarVehiculo: (id, b) => req(`/vehiculos/${id}`, { method: 'PUT', body: b }),
  vehiculoPrincipal: (id) => req(`/vehiculos/${id}/principal`, { method: 'POST' }),
  borrarVehiculo: (id) => req(`/vehiculos/${id}`, { method: 'DELETE' }),
  googleConfig: () => req('/auth/google/config'),
  google: (credential) => req('/auth/google', { method: 'POST', body: { credential } }),
  googleRegistro: (b) => req('/auth/google/registro', { method: 'POST', body: b }),
  guardarPerfil: (b) => req('/auth/perfil', { method: 'PUT', body: b }),
  yo: () => req('/auth/yo'),
  publicarPlaza: (body) => req('/plazas', { method: 'POST', body }),
  plazasCerca: (q) => req(`/plazas/cerca?${new URLSearchParams(q)}`),
  saldo: () => req('/saldo'),
  recargar: (cents) => req('/saldo/recargar', { method: 'POST', body: { cents } }),
  retirar: (b) => req('/saldo/retirar', { method: 'POST', body: b }),
  disputa: (id, motivo) => req(`/transacciones/${id}/disputa`, { method: 'POST', body: { motivo } }),
  rating: (id, estrellas) => req(`/transacciones/${id}/rating`, { method: 'POST', body: { estrellas } }),
  zonas: () => req('/plazas/zonas'),
  consentimiento: () => req('/auth/consentimiento', { method: 'POST', body: { acepta_politicas: true } }),
  pushClave: () => req('/push/clave'),
  pushSuscribir: (subscription) => req('/push/suscribir', { method: 'POST', body: { subscription } }),
  pushBaja: (endpoint) => req('/push/baja', { method: 'POST', body: { endpoint } }),
  pushPrueba: () => req('/push/prueba', { method: 'POST', body: {} }),
  ocupacion: () => req('/ocupacion'),
  marcarOcupacion: (lat, lng) => req('/ocupacion', { method: 'POST', body: { lat, lng } }),
  liberarOcupacion: () => req('/ocupacion', { method: 'DELETE' }),
  busqueda: () => req('/busqueda'),
  buscarPlaza: (lat, lng, radio_m = 600) => req('/busqueda', { method: 'PUT', body: { lat, lng, radio_m } }),
  dejarDeBuscar: () => req('/busqueda', { method: 'DELETE' }),
  plazaPorId: (id) => req(`/plazas/${id}`),
  reservar: (plazaId, usar_saldo = true, vehiculo_id) => req(`/transacciones/reservar/${plazaId}`, { method: 'POST', body: { usar_saldo, vehiculo_id } }),
  miPlaza: () => req('/plazas/mia'),
  misTransacciones: () => req('/transacciones'),
  transaccion: (id) => req(`/transacciones/${id}`),
  devPagar: (id) => req(`/transacciones/${id}/dev-pagar`, { method: 'POST' }),
  enviarPosicion: (id, lat, lng) => req(`/transacciones/${id}/posicion`, { method: 'POST', body: { lat, lng } }),
  seguimiento: (id) => req(`/transacciones/${id}/seguimiento`),
  llegue: (id) => req(`/transacciones/${id}/llegue`, { method: 'POST' }),
  salgo: (id) => req(`/transacciones/${id}/salgo`, { method: 'POST' }),
  chat: (id) => req(`/transacciones/${id}/chat`),
  enviarChat: (id, texto) => req(`/transacciones/${id}/chat`, { method: 'POST', body: { texto } }),
  renovarPlaza: (id) => req(`/plazas/${id}/renovar`, { method: 'POST' }),
  onboardingVisto: () => req('/auth/onboarding', { method: 'POST' }),
  cancelarPlaza: (id) => req(`/plazas/${id}`, { method: 'DELETE' }),
};
