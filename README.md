# Parking P2P (MVP)

Marketplace P2P para vender/comprar plazas de aparcamiento gratuitas. Zona piloto: Calle Aloná (Alicante).

- `client/` React + Vite + Tailwind (PWA) → Vercel
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

## Seguridad
- `.env*` nunca se sube a git. `STRIPE_SECRET_KEY` solo en el servidor.
- Restringe la clave de Google Maps por dominio (HTTP referrer) en Google Cloud.

## Estado (semana 1)
Auth JWT, esquema PostGIS, publicar/buscar plazas con foto de matrícula, mapa, PWA.
Pendiente: chat WebSocket, Stripe Connect + escrow, ratings, notificaciones, admin, deploy.
