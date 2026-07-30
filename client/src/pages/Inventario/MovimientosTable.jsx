import { Download } from 'lucide-react';
import { MOVIMIENTOS_LIMIT } from './constants';

export default function MovimientosTable({
  movFiltrados,
  movimientosCount,
  movFechaDesde,
  movFechaHasta,
  onSetMovFechaDesde,
  onSetMovFechaHasta,
  onExportarHistorialMovimientosCSV,
}) {
  return (
    <div className="rounded-[32px] bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Movimientos</h3>
        <button
          onClick={onExportarHistorialMovimientosCSV}
          title="Exportar CSV"
          className="h-8 w-8 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500 hover:bg-primary-500 hover:text-white transition-all"
        >
          <Download size={14} strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            Desde
          </label>
          <input
            type="date"
            value={movFechaDesde}
            onChange={(e) => onSetMovFechaDesde(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-xl border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-700 outline-none focus:border-primary-200 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            Hasta
          </label>
          <input
            type="date"
            value={movFechaHasta}
            onChange={(e) => onSetMovFechaHasta(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-xl border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-700 outline-none focus:border-primary-200 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>
      {(movFechaDesde || movFechaHasta) && (
        <button
          onClick={() => {
            onSetMovFechaDesde('');
            onSetMovFechaHasta('');
          }}
          className="mb-3 text-[10px] font-bold text-gray-400 hover:text-rose-500 transition-colors"
        >
          × Limpiar filtros · {movFiltrados.length} resultados
        </button>
      )}
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 no-scrollbar">
        {movFiltrados.length === 0 ? (
          <div className="py-6 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Sin movimientos
          </div>
        ) : (
          movFiltrados.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <div
                className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center font-black text-[10px] ${Number(m.cantidad) > 0 ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}
              >
                {Number(m.cantidad) > 0 ? '+' : ''}
                {m.cantidad}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-gray-800 uppercase tracking-tight truncate">
                  {m.insumo_nombre || m.producto_nombre}
                </p>
                <p className="text-[10px] font-bold text-gray-400 uppercase">
                  {m.motivo || m.tipo}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {movimientosCount >= MOVIMIENTOS_LIMIT && (
        <p className="mt-3 text-[10px] font-bold text-gray-400 text-center">
          Mostrando los últimos {MOVIMIENTOS_LIMIT} movimientos. Puede haber más en el historial.
        </p>
      )}
    </div>
  );
}
