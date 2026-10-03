-- Seguimiento en vivo del comprador hacia la plaza (solo mientras la reserva está pagada y no ha llegado).
-- Una fila por transacción, sobrescrita en cada actualización; se borra al llegar, liberar o a las 2 h sin señal.
create table seguimiento (
  transaccion_id uuid primary key references transacciones(id) on delete cascade,
  geo geography(Point,4326) not null,
  updated_at timestamptz not null default now()
);
