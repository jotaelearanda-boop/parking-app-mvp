// Iconos SVG sencillos (trazo), heredan el color del texto.
const base = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconoBuscar = () => (<svg {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconoCoche = () => (<svg {...base}><path d="M5 17h14M3 13l2-6a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 6v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><circle cx="7.5" cy="14" r=".6" /><circle cx="16.5" cy="14" r=".6" /></svg>);
export const IconoCartera = () => (<svg {...base}><path d="M4 7a2 2 0 0 1 2-2h11v4" /><path d="M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2z" /><circle cx="16.5" cy="14" r="1" /></svg>);
export const IconoEscudo = () => (<svg {...base}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconoSalir = () => (<svg {...base}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M16 8l4 4-4 4M20 12H9" /></svg>);
export const IconoPin = () => (<svg {...base}><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>);
