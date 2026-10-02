-- Datos del coche para que comprador y vendedor se reconozcan (sin fotos: menos datos personales y sin almacenamiento).
alter table users add column vehiculo_modelo text, add column vehiculo_color text, add column vehiculo_matricula text;
