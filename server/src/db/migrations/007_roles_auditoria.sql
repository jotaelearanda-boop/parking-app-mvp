-- Roles del equipo y registros de auditoría inmutables (solo inserciones).
alter table users add column rol text not null default 'usuario' check (rol in ('usuario','gestor','superadmin'));
alter table eventos add column user_id uuid, add column ip text;
alter table admin_log add column ip text, add column user_agent text;
create index eventos_tipo_idx on eventos (tipo, id desc);

create or replace function prohibir_cambios() returns trigger as $$
begin
  raise exception 'Los registros de auditoría son de solo inserción (no se pueden modificar ni borrar)';
end $$ language plpgsql;

create trigger admin_log_inmutable before update or delete on admin_log for each row execute function prohibir_cambios();
create trigger eventos_inmutable before update or delete on eventos for each row execute function prohibir_cambios();
