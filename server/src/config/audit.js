// Registro de eventos del sistema (append-only). Nunca debe romper el flujo principal.
import { query } from './db.js';

export const evento = (tipo, { userId = null, ip = null, data = null } = {}) =>
  query('insert into eventos(tipo, user_id, ip, payload) values ($1,$2,$3,$4)', [tipo, userId, ip, data]).catch((e) => console.error('evento', e.message));
