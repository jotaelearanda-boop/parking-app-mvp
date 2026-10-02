-- El vendedor puede no indicar cuánto tiempo se queda. En ese caso la plaza dura 4 h como máximo.
alter table plazas_activas add column tiempo_indicado boolean not null default true;
