// Cliente HTTP del backend. El token JWT vive en localStorage (MVP).
export const getToken = () => localStorage.getItem('token');
export const setSession = (token) => token ? localStorage.setItem('token', token) : localStorage.removeItem('token');

async function req(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: form ?? (body && JSON.stringify(body)) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { codigo: data.codigo });
  return data;
}

export const api = {
  registro: (b) => req('/auth/registro', { method: 'POST', body: b }),
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  yo: () => req('/auth/yo'),
  publicarPlaza: (form) => req('/plazas', { method: 'POST', form }),
  plazasCerca: (q) => req(`/plazas/cerca?${new URLSearchParams(q)}`),
  stripeOnboarding: () => req('/stripe/onboarding', { method: 'POST' }),
  stripeEstado: () => req('/stripe/estado'),
  saldo: () => req('/saldo'),
  recargar: (cents) => req('/saldo/recargar', { method: 'POST', body: { cents } }),
  retirar: () => req('/saldo/retirar', { method: 'POST' }),
  reservar: (plazaId) => req(`/transacciones/reservar/${plazaId}`, { method: 'POST' }),
  misTransacciones: () => req('/transacciones'),
  transaccion: (id) => req(`/transacciones/${id}`),
  devPagar: (id) => req(`/transacciones/${id}/dev-pagar`, { method: 'POST' }),
  llegue: (id) => req(`/transacciones/${id}/llegue`, { method: 'POST' }),
  salgo: (id) => req(`/transacciones/${id}/salgo`, { method: 'POST' }),
  chat: (id) => req(`/transacciones/${id}/chat`),
  enviarChat: (id, texto) => req(`/transacciones/${id}/chat`, { method: 'POST', body: { texto } }),
  cancelarPlaza: (id) => req(`/plazas/${id}`, { method: 'DELETE' }),
};
