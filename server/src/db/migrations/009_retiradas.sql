-- Retiradas de saldo sin Stripe Connect: el usuario solicita (Bizum o IBAN) y el equipo la paga desde el backoffice.
create table retiradas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  importe_cents int not null check (importe_cents > 0),
  metodo text not null check (metodo in ('bizum','iban')),
  telefono text,
  iban text,
  titular text,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','rechazada')),
  referencia text,
  motivo_rechazo text,
  solicitada_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid references users(id)
);
create unique index una_retirada_pendiente on retiradas (user_id) where estado = 'pendiente';
create index retiradas_estado_idx on retiradas (estado, solicitada_at);
