// Operaciones de saldo. Siempre dentro de una transacción de BD (client) para que
// el movimiento y el saldo cambien juntos. El CHECK (saldo_cents >= 0) impide saldo negativo.
export const SALDO_MAX_CENTS = Number(process.env.SALDO_MAX_CENTS ?? 5000);   // tope de recarga: 50 €
export const RECARGA_MIN_CENTS = 1000;                                        // recarga mínima: 10 €
export const RETIRADA_MIN_CENTS = Number(process.env.RETIRADA_MIN_CENTS ?? 500);

export async function moverSaldo(client, userId, tipo, montoCents, { transaccionId = null, stripeRef = null } = {}) {
  await client.query(
    'insert into saldo_movimientos(user_id, tipo, monto_cents, transaccion_id, stripe_ref) values ($1,$2,$3,$4,$5)',
    [userId, tipo, montoCents, transaccionId, stripeRef]);   // viola índice único si se repite
  const { rows } = await client.query(
    'update users set saldo_cents = saldo_cents + $1 where id=$2 returning saldo_cents', [montoCents, userId]);
  return rows[0].saldo_cents;
}
