import { AlertTriangle, ArrowLeft, Maximize, Minimize2, ShoppingCart, X } from 'lucide-react';

export default function TpvHeader({
  cajaAbierta,
  isBrowserFullscreen,
  onBack,
  onGoCaja,
  onToggleFullscreen,
}) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white shadow-lg shadow-primary-200">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900">Punto de Venta</h1>
              {!cajaAbierta ? (
                <div className="flex items-center gap-1.5 text-danger-600 animate-pulse">
                  <X size={14} className="stroke-[3]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Caja Cerrada
                  </span>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Caja activa
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Ctrl+Enter vende
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Ctrl+Shift+Enter imprime
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Alt+G guarda
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Alt+R recupera
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-11 items-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 active:scale-95"
            >
              <ArrowLeft size={16} className="mr-2" />
              Panel
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="inline-flex h-11 items-center rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white transition hover:bg-primary-600 active:scale-95"
            >
              {isBrowserFullscreen ? (
                <Minimize2 size={16} className="mr-2" />
              ) : (
                <Maximize size={16} className="mr-2" />
              )}
              {isBrowserFullscreen ? 'Salir' : 'Fullscreen'}
            </button>
          </div>
        </div>
      </header>

      {!cajaAbierta ? (
        <div className="flex items-center justify-between gap-4 border-b border-rose-100 bg-danger-50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-danger-100 p-2 text-danger-600">
              <AlertTriangle size={18} />
            </div>
            <p className="text-sm font-bold text-rose-800">
              Debes abrir la caja para poder registrar ventas. Inicia el turno en el modulo de Caja.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoCaja}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white transition-all hover:bg-rose-700"
          >
            IR A CAJA
          </button>
        </div>
      ) : null}
    </>
  );
}
