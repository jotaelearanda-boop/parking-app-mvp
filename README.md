# APParK (MVP)

Marketplace P2P para vender/comprar plazas de aparcamiento gratuitas. Zona piloto: Calle Aloná (Alicante).

- `client/` React + Vite + Tailwind (PWA) → Vercel
- `backoffice/` Panel interno del equipo (React + Vite). **Aplicación aparte**, con otro dominio y login propio → Vercel (2.º proyecto, root `backoffice`)
- `server/` Node/Express + PostgreSQL/PostGIS (Supabase) → Railway

## Setup local

1. **Base de datos**: crea un proyecto en [Supabase](https://supabase.com) (incluye PostGIS) y copia la cadena de conexión.
2. **Servidor**
   ```bash
   cd server && cp .env.example .env   # rellena DATABASE_URL y JWT_SECRET
   npm install && npm run migrate && npm run dev
   ```
3. **Cliente**
   ```bash
   cd client && cp .env.example .env.local   # rellena VITE_GOOGLE_MAPS_KEY
   npm install && npm run dev
   ```
   Abre http://localhost:5173 (el proxy de Vite reenvía `/api` al puerto 4000).

## Pagos (Stripe, modo test)
1. En `server/.env`: `STRIPE_SECRET_KEY=sk_test_...` (solo servidor, nunca en git).
2. Activa Connect en el Dashboard de Stripe y acepta las responsabilidades en Ajustes → Connect → Perfil de la plataforma.
3. Webhooks en local con la Stripe CLI (cada vez que reinicies el equipo):
   ```bash
   STRIPE_API_KEY=<tu sk_test> stripe listen --events payment_intent.succeeded,payment_intent.payment_failed \
     --forward-to localhost:4000/api/stripe/webhook
   ```
   Copia el `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET` en `server/.env`.
4. Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y CVC.

Modelo: el comprador paga a la plataforma (escrow) o con **saldo** interno. Al pulsar "SALGO" el vendedor recibe su parte
(precio − 20 %) en **saldo**; puede usarlo para comprar plazas o retirarlo (alta Stripe Connect con verificación, solo al retirar).
Apple Pay / Google Pay aparecen solos en HTTPS con dominio verificado en Stripe (no en `localhost`).

## Tareas automáticas (`server/src/jobs.js`, cada minuto)
Caducar plazas · cancelar reservas sin pagar tras 10 min · reembolsar disputas sin resolver tras 24 h · borrar ubicación y foto 1 h tras cerrar (RGPD).

## Backoffice
App separada en `backoffice/` (`cd backoffice && npm i && npm run dev` → http://localhost:5174). Login propio en `/api/backoffice/login`; solo cuentas con rol `gestor` o `superadmin`.
Para dar el primer permiso: `update users set rol = 'superadmin' where email = '...';` (después, el equipo se gestiona desde la pestaña Equipo).
Variable del servidor: `ADMIN_ORIGIN` = URL(s) del backoffice, separadas por comas (CORS).

## Seguridad
- `.env*` nunca se sube a git. `STRIPE_SECRET_KEY` solo en el servidor.
- Restringe la clave de Google Maps por dominio (HTTP referrer) en Google Cloud.

## Estado
Hecho: auth, plazas con PostGIS, mapa, chat y avisos WebSocket, pagos Stripe + saldo, ratings con suspensión, disputas, jobs RGPD, admin.
Pendiente: subida de fotos a almacenamiento persistente, deploy (Vercel + Railway), QA y beta.
