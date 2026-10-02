import { createContext, useCallback, useContext, useState } from 'react';

// Avisos emergentes que desaparecen solos. Uso: const aviso = useToast(); aviso('Texto', 'error'|'ok'|'info')
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const aviso = useCallback((texto, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, texto, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 5000 : 3500);
  }, []);
  const color = { error: 'bg-red-600', ok: 'bg-green-600', info: 'bg-gray-900' };
  return (
    <Ctx.Provider value={aviso}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] mx-auto flex max-w-xl flex-col gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-xl px-4 py-3 text-white shadow-lg ${color[t.tipo]}`}>
            {t.tipo === 'error' ? '⚠️ ' : t.tipo === 'ok' ? '✅ ' : ''}{t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
