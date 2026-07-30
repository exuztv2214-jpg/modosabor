import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorState({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 font-sans">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 text-gray-300 shadow-sm">
          <AlertTriangle size={36} strokeWidth={1.5} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">No pudimos cargar el menú</h2>
        <p className="mb-8 text-sm font-medium leading-relaxed text-gray-400">
          Revisá tu conexión a internet e intentá de nuevo.
        </p>
        <button
          onClick={onRetry}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-gray-900 px-6 text-sm font-semibold text-white shadow-lg transition-all hover:bg-gray-800 active:scale-95"
        >
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    </div>
  );
}
