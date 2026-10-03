-- Varios coches por usuario. users.vehiculo_* se mantiene como copia del coche principal (lo lee el backoffice).
create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  modelo text not null,
  color text not null,
  matricula text not null,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  borrado_at timestamptz                                  -- baja lógica: el historial sigue mostrando el coche
);
create unique index vehiculo_principal_unico on vehiculos (user_id) where principal and borrado_at is null;
create unique index vehiculo_matricula_unica on vehiculos (user_id, matricula) where borrado_at is null;

insert into vehiculos (user_id, modelo, color, matricula, principal)
  select id, vehiculo_modelo, vehiculo_color, vehiculo_matricula, true from users where vehiculo_matricula is not null;

alter table plazas_activas add column vehiculo_id uuid references vehiculos(id);
alter table transacciones add column comprador_vehiculo_id uuid references vehiculos(id);

-- "Busco plaza" dura como máximo 1 h y se desactiva al encontrar plaza.
