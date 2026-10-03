-- Plaza ocupada ("tengo plaza"), avisos push y modo "Busco plaza".
create table ocupaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  geo geography(Point,4326),                      -- se borra al terminar (RGPD)
  origen text not null check (origen in ('comprada','manual')),
  desde timestamptz not null default now(),
  ultimo_aviso_at timestamptz,
  activa boolean not null default true,
  terminada_at timestamptz
);
create unique index una_ocupacion_activa on ocupaciones (user_id) where activa;

create table push_subs (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subs_user_idx on push_subs (user_id);

create table busquedas_activas (
  user_id uuid primary key references users(id) on delete cascade,
  geo geography(Point,4326) not null,
  radio_m int not null default 600 check (radio_m between 100 and 2000),
  hasta timestamptz not null,
  ultimo_match_at timestamptz,
  created_at timestamptz not null default now()
);
create index busquedas_geo_idx on busquedas_activas using gist (geo);
