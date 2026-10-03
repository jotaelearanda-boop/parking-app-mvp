import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import transaccionesRoutes from './routes/transacciones.js';
import { attachWs } from './ws.js';
import { webhook } from './routes/stripe.js';
import saldoRoutes from './routes/saldo.js';
import adminRoutes from './routes/admin.js';
import backofficeRoutes from './routes/backoffice.js';
import { iniciarJobs } from './jobs.js';
import pushRoutes from './routes/push.js';
import ocupacionRoutes from './routes/ocupacion.js';
import busquedaRoutes from './routes/busqueda.js';
import vehiculosRoutes from './routes/vehiculos.js';
import plazasRoutes from './routes/plazas.js';

export const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway: IP real para el rate-limit
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: [env.clientOrigin, ...env.adminOrigins] }));
// El webhook de Stripe necesita el cuerpo crudo: va ANTES de express.json.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhook);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_q, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20 }), authRoutes);
app.use('/api/saldo', saldoRoutes);
app.use('/api/backoffice', backofficeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plazas', plazasRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/ocupacion', ocupacionRoutes);
app.use('/api/busqueda', busquedaRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/transacciones', transaccionesRoutes);

app.use((err, _q, res, _n) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

if (process.argv[1]?.endsWith('index.js')) {
  const server = app.listen(env.port, () => console.log(`API en :${env.port}`));
  attachWs(server);
  iniciarJobs();
}
