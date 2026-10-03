// Cliente del backoffice. El token vive en sessionStorage (se borra al cerrar la pestaña) y caduca a las 8 h.
export const API_URL = import.meta.env.VITE_API_URL ?? '';
export const getToken = () => sessionStorage.getItem('bo_token');
export const setToken = (t) => (t ? sessionStorage.setItem('bo_token', t) : sessionStorage.removeItem('bo_token'));

async function req(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body && JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && getToken()) { setToken(null); location.reload(); }   // sesión caducada
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export const api = {
  login: (email, password) => req('/backoffice/login', { method: 'POST', body: { email, password } }),
  yo: () => req('/admin/yo'),
  adminResumen: () => req('/admin/resumen'),
  adminDisputas: () => req('/admin/disputas'),
  adminResolver: (id, accion) => req(`/admin/disputas/${id}/resolver`, { method: 'POST', body: { accion } }),
  adminUsuarios: (q = '') => req(`/admin/usuarios?q=${encodeURIComponent(q)}`),
  adminUsuario: (id) => req(`/admin/usuarios/${id}`),
  adminSuspender: (id, dias, motivo) => req(`/admin/usuarios/${id}/suspender`, { method: 'POST', body: { dias, motivo } }),
  adminReactivar: (id) => req(`/admin/usuarios/${id}/reactivar`, { method: 'POST', body: {} }),
  adminAjuste: (id, cents, motivo) => req(`/admin/usuarios/${id}/ajuste-saldo`, { method: 'POST', body: { cents, motivo } }),
  adminTransacciones: (estado = '') => req(`/admin/transacciones?estado=${estado}`),
  adminZonas: () => req('/admin/zonas'),
  adminCrearZona: (b) => req('/admin/zonas', { method: 'POST', body: b }),
  adminZonaActiva: (id, activa) => req(`/admin/zonas/${id}`, { method: 'PATCH', body: { activa } }),
  adminBorrarZona: (id) => req(`/admin/zonas/${id}`, { method: 'DELETE' }),
  adminLog: (http = false) => req(`/admin/log${http ? '?http=1' : ''}`),
  adminEventos: (tipo = '') => req(`/admin/eventos?tipo=${encodeURIComponent(tipo)}`),
  adminRetiradas: (estado = 'pendiente') => req(`/admin/retiradas?estado=${estado}`),
  adminPagarRetirada: (id, referencia) => req(`/admin/retiradas/${id}/pagar`, { method: 'POST', body: { referencia } }),
  adminRechazarRetirada: (id, motivo) => req(`/admin/retiradas/${id}/rechazar`, { method: 'POST', body: { motivo } }),
  adminEquipo: () => req('/admin/equipo'),
  adminCambiarRol: (email, rol) => req('/admin/equipo', { method: 'POST', body: { email, rol } }),
};
