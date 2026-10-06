-- Sugerencias, errores y mejoras que envían los usuarios desde "Mi cuenta"; el equipo las contesta desde el backoffice.
create table sugerencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  tipo text not null check (tipo in ('sugerencia','error','mejora')),
  estado text not null default 'abierta' check (estado in ('abierta','respondida','cerrada')),
  contexto jsonb,                                    -- navegador y pantalla desde la que se escribió
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sugerencias_user on sugerencias (user_id, updated_at desc);
create index sugerencias_estado on sugerencias (estado, updated_at desc);

create table sugerencias_mensajes (
  id bigserial primary key,
  sugerencia_id uuid not null references sugerencias(id) on delete cascade,
  autor text not null check (autor in ('usuario','equipo')),
  staff_id uuid references users(id),
  texto text not null,
  leido_usuario boolean not null default false,       -- solo importa en mensajes del equipo
  created_at timestamptz not null default now()
);
create index sugerencias_mensajes_s on sugerencias_mensajes (sugerencia_id, id);
