import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import transaccionesRoutes from './routes/transacciones.js';
import { attachWs } from './ws.js';
import { router as stripeRoutes, webhook } from './routes/stripe.js';
import plazasRoutes, { UPLOAD_DIR } from './routes/plazas.js';

export const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientOrigin }));
// El webhook de Stripe necesita el cuerpo crudo: va ANTES de express.json.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhook);
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(UPLOAD_DIR)); // TODO: restringir foto matrícula tras compra

app.get('/health', (_q, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20 }), authRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/plazas', plazasRoutes);
app.use('/api/transacciones', transaccionesRoutes);

app.use((err, _q, res, _n) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

if (process.argv[1]?.endsWith('index.js')) {
  const server = app.listen(env.port, () => console.log(`API en :${env.port}`));
  attachWs(server);
}
