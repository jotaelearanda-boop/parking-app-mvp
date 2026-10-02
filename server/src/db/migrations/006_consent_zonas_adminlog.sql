-- Consentimiento (términos + privacidad + ubicación), zonas bloqueadas (zona azul/naranja) y auditoría del backoffice.
alter table users add column consent_at timestamptz, add column consent_version text, add column suspension_motivo text;

create table zonas_bloqueadas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'azul' check (tipo in ('azul','naranja','verde','otra')),
  geom geography(MultiPolygon,4326) not null,
  activa boolean not null default true,
  creada_por uuid references users(id),
  created_at timestamptz not null default now()
);
create index zonas_geom_idx on zonas_bloqueadas using gist (geom);

create table admin_log (
  id bigserial primary key,
  admin_id uuid not null references users(id),
  accion text not null,
  objetivo_tipo text,
  objetivo_id text,
  detalle jsonb,
  created_at timestamptz not null default now()
);
