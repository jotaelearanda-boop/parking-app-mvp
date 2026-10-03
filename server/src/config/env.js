const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta variable de entorno ${k}`);
  return v;
};
export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: need('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Zona piloto: Benalúa (calle Aloná + García Andreu, Alicante).
  zona: { lat: 38.3414, lng: -0.4963, radioM: Number(process.env.ZONA_RADIO_M ?? 700),
          estricta: (process.env.ZONA_ESTRICTA ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true' },
  // Orígenes del backoffice (separado de la app de clientes), separados por comas.
  adminOrigins: (process.env.ADMIN_ORIGIN ?? 'http://localhost:5174').split(',').map((x) => x.trim()).filter(Boolean),
  comisionPct: Number(process.env.COMISION_PCT ?? 20),
  stripeKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};

// Notificaciones push (Web Push / VAPID). Sin claves, el servidor funciona igual pero no envía push.
export const push = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT ?? 'https://parking-app-mvp-beryl.vercel.app',
  recordatorioHoras: Number(process.env.RECORDATORIO_HORAS ?? 5),
};
