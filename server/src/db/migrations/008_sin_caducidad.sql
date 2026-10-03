-- Las plazas no caducan: una plaza publicada sigue disponible hasta que se reserve o su dueño la cancele.
-- (No vendemos la plaza, sino la conexión entre quien se va y quien llega.)
alter table plazas_activas alter column tiempo_min drop not null;
alter table plazas_activas alter column expira_at drop not null;
alter table plazas_activas drop constraint if exists plazas_activas_tiempo_min_check;
alter table plazas_activas add column cerrada_at timestamptz;
update plazas_activas set expira_at = null where estado in ('disponible','reservada');
update plazas_activas set cerrada_at = now() where estado in ('cancelada','completada','expirada') and cerrada_at is null;
