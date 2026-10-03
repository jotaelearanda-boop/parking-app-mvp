-- Acceso con Google. sin_password: cuenta creada con Google que aún no tiene contraseña propia.
alter table users add column google_sub text unique, add column sin_password boolean not null default false;
