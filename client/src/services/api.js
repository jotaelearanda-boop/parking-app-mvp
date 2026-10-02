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
  guardarVehiculo: (b) => req('/auth/vehiculo', { method: 'PUT', body: b }),
  yo: () => req('/auth/yo'),
  publicarPlaza: (body) => req('/plazas', { method: 'POST', body }),
  plazasCerca: (q) => req(`/plazas/cerca?${new URLSearchParams(q)}`),
  stripeOnboarding: () => req('/stripe/onboarding', { method: 'POST' }),
  stripeEstado: () => req('/stripe/estado'),
  saldo: () => req('/saldo'),
  recargar: (cents) => req('/saldo/recargar', { method: 'POST', body: { cents } }),
  retirar: () => req('/saldo/retirar', { method: 'POST' }),
  disputa: (id, motivo) => req(`/transacciones/${id}/disputa`, { method: 'POST', body: { motivo } }),
  rating: (id, estrellas) => req(`/transacciones/${id}/rating`, { method: 'POST', body: { estrellas } }),
  zonas: () => req('/plazas/zonas'),
  consentimiento: () => req('/auth/consentimiento', { method: 'POST', body: { acepta_politicas: true } }),
  reservar: (plazaId, usar_saldo = true) => req(`/transacciones/reservar/${plazaId}`, { method: 'POST', body: { usar_saldo } }),
  miPlaza: () => req('/plazas/mia'),
  misTransacciones: () => req('/transacciones'),
  transaccion: (id) => req(`/transacciones/${id}`),
  devPagar: (id) => req(`/transacciones/${id}/dev-pagar`, { method: 'POST' }),
  llegue: (id) => req(`/transacciones/${id}/llegue`, { method: 'POST' }),
  salgo: (id) => req(`/transacciones/${id}/salgo`, { method: 'POST' }),
  chat: (id) => req(`/transacciones/${id}/chat`),
  enviarChat: (id, texto) => req(`/transacciones/${id}/chat`, { method: 'POST', body: { texto } }),
  cancelarPlaza: (id) => req(`/plazas/${id}`, { method: 'DELETE' }),
};
