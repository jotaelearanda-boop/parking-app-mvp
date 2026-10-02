import Stripe from 'stripe';
import { env } from './env.js';

// null si no hay clave: la app arranca igual (modo dev con pago simulado).
export const stripe = env.stripeKey ? new Stripe(env.stripeKey) : null;
export const requireStripe = (_q, res, next) =>
  stripe ? next() : res.status(503).json({ error: 'Stripe no configurado en el servidor' });
