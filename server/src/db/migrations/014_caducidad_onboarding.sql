-- Las plazas vuelven a caducar (10 min): un vendedor publica al salir; una plaza vieja puede estar ya ocupada.
-- restante_s guarda el tiempo que le quedaba cuando alguien la reserva (el contador se pausa mientras haya reserva).
alter table plazas_activas add column restante_s int;
-- Guía de bienvenida: se muestra una vez por persona.
alter table users add column onboarding_at timestamptz;
