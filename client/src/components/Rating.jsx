import { useState } from 'react';

// Selector de 1-5 estrellas. onSelect(n) se llama una vez.
export default function Rating({ onSelect }) {
  const [hecho, setHecho] = useState(false);
  const [hover, setHover] = useState(0);
  if (hecho) return <p className="font-semibold text-green-700">¡Gracias por valorar!</p>;
  return (
    <div>
      <p className="mb-1 text-sm">Valora a la otra persona</p>
      <div className="flex gap-1 text-3xl" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} estrellas`} onMouseEnter={() => setHover(n)}
            onClick={() => onSelect(n).then(() => setHecho(true)).catch(() => {})}
            className={n <= hover ? 'text-yellow-500' : 'text-gray-300'}>★</button>
        ))}
      </div>
    </div>
  );
}
