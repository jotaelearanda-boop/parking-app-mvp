const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta variable de entorno ${k}`);
  return v;
};
export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: need('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  comisionPct: Number(process.env.COMISION_PCT ?? 20),
  stripeKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};
