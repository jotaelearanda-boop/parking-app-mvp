-- Esquema inicial. Requiere PostGIS (en Supabase: create extension postgis).
create extension if not exists postgis;
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text not null,
  name text not null,
  password_hash text not null,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  suspended_until timestamptz,
  is_admin boolean not null default false,
  stripe_account_id text,          -- cuenta Stripe Connect del vendedor
  created_at timestamptz not null default now()
);

create table plazas_activas (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users(id),
  geo geography(Point,4326) not null,
  zona text not null default 'alona',
  precio_cents int not null check (precio_cents between 50 and 2000),
  tiempo_min int not null check (tiempo_min in (30,60,120,240)),
  foto_matricula_url text not null,
  estado text not null default 'disponible'
    check (estado in ('disponible','reservada','completada','cancelada','expirada')),
  expira_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index plazas_geo_idx on plazas_activas using gist (geo);
create index plazas_estado_idx on plazas_activas (estado, expira_at);

create table transacciones (
  id uuid primary key default gen_random_uuid(),
  plaza_id uuid not null references plazas_activas(id),
  vendedor_id uuid not null references users(id),
  comprador_id uuid not null references users(id),
  monto_cents int not null,
  comision_cents int not null,
  stripe_payment_intent text,
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago','en_escrow','liberada','reembolsada','disputada','cancelada')),
  comprador_llego_at timestamptz,
  vendedor_salio_at timestamptz,
  created_at timestamptz not null default now(),
  location_purge_at timestamptz     -- RGPD: borrar ubicación 1h tras cerrar
);
create unique index una_tx_activa_por_plaza on transacciones (plaza_id)
  where estado in ('pendiente_pago','en_escrow','disputada');

create table ratings (
  id uuid primary key default gen_random_uuid(),
  transaccion_id uuid not null references transacciones(id),
  autor_id uuid not null references users(id),
  destino_id uuid not null references users(id),
  estrellas int not null check (estrellas between 1 and 5),
  created_at timestamptz not null default now(),
  unique (transaccion_id, autor_id)
);

create table chats (
  id bigserial primary key,
  transaccion_id uuid not null references transacciones(id),
  autor_id uuid not null references users(id),
  texto text not null check (length(texto) <= 500),
  created_at timestamptz not null default now()
);

create table disputas (
  id uuid primary key default gen_random_uuid(),
  transaccion_id uuid not null references transacciones(id),
  reportada_por uuid not null references users(id),
  motivo text not null,
  estado text not null default 'abierta' check (estado in ('abierta','reembolsada','rechazada')),
  created_at timestamptz not null default now()
);

create table eventos (  -- métricas simples (latencia, errores Stripe, etc.)
  id bigserial primary key,
  tipo text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
