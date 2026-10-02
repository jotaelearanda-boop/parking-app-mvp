import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) : null;

function Formulario({ returnPath }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function pagar(e) {
    e.preventDefault();
    if (!stripe) return;
    setEnviando(true); setErr('');
    const { error } = await stripe.confirmPayment({
      elements, confirmParams: { return_url: `${location.origin}${returnPath}` },
    });
    if (error) { setErr(error.message); setEnviando(false); } // si va bien, Stripe redirige o avisa por webhook
  }
  return (
    <form onSubmit={pagar} className="space-y-3 rounded-lg border bg-white p-3">
      <PaymentElement />
      {err && <p className="text-red-600">{err}</p>}
      <button disabled={!stripe || enviando} className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300">
        {enviando ? 'Procesando…' : 'Pagar'}
      </button>
    </form>
  );
}

export default function Pago({ clientSecret, returnPath }) {
  if (!stripePromise) return <p className="text-red-600">Falta VITE_STRIPE_PUBLISHABLE_KEY</p>;
  return <Elements stripe={stripePromise} options={{ clientSecret }}><Formulario returnPath={returnPath} /></Elements>;
}
