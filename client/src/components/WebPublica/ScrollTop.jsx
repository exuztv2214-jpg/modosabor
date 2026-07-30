import { ChevronUp } from 'lucide-react';

export default function ScrollTop({ show, config, totalItems }) {
  if (!show) return null;

  const bottom = config?.negocio_telefono
    ? totalItems > 0
      ? '11.5rem'
      : '6rem'
    : totalItems > 0
      ? '7rem'
      : '1.5rem';

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      className="fixed right-4 z-[121] h-11 w-11 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all"
      style={{ bottom }}
    >
      <ChevronUp size={20} strokeWidth={2.5} />
    </button>
  );
}
