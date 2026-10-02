-- RGPD: permitir borrar ubicación y foto de plazas cerradas sin perder el histórico económico.
alter table plazas_activas alter column geo drop not null;
alter table plazas_activas alter column foto_matricula_url drop not null;
alter table plazas_activas add column purgada_at timestamptz;
alter table users add column advertido_at timestamptz;
