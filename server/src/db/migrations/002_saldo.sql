-- Monedero interno ("crédito de la app"). El saldo es una caché; la verdad está en saldo_movimientos.
alter table users add column saldo_cents int not null default 0 check (saldo_cents >= 0);
alter table transacciones add column pago_con_saldo boolean not null default false;

create table saldo_movimientos (
  id bigserial primary key,
  user_id uuid not null references users(id),
  tipo text not null check (tipo in ('venta','pago_plaza','recarga','retirada','reembolso','ajuste')),
  monto_cents int not null check (monto_cents <> 0),   -- con signo: + ingreso, - gasto
  transaccion_id uuid references transacciones(id),
  stripe_ref text,                                     -- PaymentIntent de la recarga / transfer de la retirada
  created_at timestamptz not null default now()
);
create index saldo_mov_user_idx on saldo_movimientos (user_id, id desc);
-- Idempotencia: un mismo evento no puede abonar/cobrar dos veces.
create unique index saldo_mov_unico_tx on saldo_movimientos (user_id, tipo, transaccion_id) where transaccion_id is not null;
create unique index saldo_mov_unico_ref on saldo_movimientos (tipo, stripe_ref) where stripe_ref is not null;
