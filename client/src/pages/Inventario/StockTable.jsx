import { Search, Download, Pencil, History, Trash2 } from 'lucide-react';
import { fmtStock } from './utils';

export default function StockTable({
  filteredInsumos,
  busqueda,
  sharedBases,
  onSetBusqueda,
  onOpenEditInsumo,
  onExportarInsumosCSV,
  onSetMovementModal,
  onDeleteInsumo,
}) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm border border-gray-100">
      <div className="mb-8 rounded-[24px] border border-primary-100 bg-primary-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary-500">
              Bases compartidas
            </p>
            <h4 className="mt-2 text-lg font-black text-gray-900">
              Lo que manda el stock real de cocina
            </h4>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Estas bases pegan sobre varias pizzas, hamburguesas y milanesas al mismo tiempo.
            </p>
          </div>
          <a
            href="/admin/operacion"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-xs font-black uppercase tracking-widest text-primary-500 shadow-sm transition hover:bg-primary-50"
          >
            Abrir stock diario
          </a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sharedBases.slice(0, 9).map((item) => (
            <div
              key={item.id}
              className="rounded-[18px] border border-white bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-black uppercase text-gray-900">{item.nombre}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {item.dependencias} productos dependen de esta base
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-lg font-black text-primary-500">
                  {fmtStock(item.stock_actual, item.unidad)}
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.stock_bajo ? 'bg-danger-100 text-danger-600' : 'bg-success-100 text-success-600'}`}
                >
                  {item.stock_bajo ? 'Bajo' : 'OK'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
          Catálogo de Insumos
        </h3>
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              value={busqueda}
              onChange={(e) => onSetBusqueda(e.target.value)}
              placeholder="Buscar insumo..."
              className="h-11 w-full rounded-2xl bg-gray-50 pl-12 pr-4 text-sm font-bold border-none focus:ring-2 focus:ring-[#5D87FF]/20 transition-all"
            />
          </div>
          <button
            onClick={onExportarInsumosCSV}
            title="Exportar CSV"
            className="flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-500 transition-all shadow-sm shrink-0"
          >
            <Download size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredInsumos.map((insumo) => {
          const pct = Math.min(
            100,
            Math.max(0, (Number(insumo.stock_actual) / (Number(insumo.stock_minimo) * 3)) * 100)
          );
          const isLow = insumo.stock_bajo;
          return (
            <div
              key={insumo.id}
              className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight line-clamp-2">
                    {insumo.nombre}
                  </h4>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {insumo.rubro}
                  </p>
                </div>
                <button
                  onClick={() => onOpenEditInsumo(insumo)}
                  className="p-2 text-gray-300 hover:text-primary-500 transition-colors"
                >
                  <Pencil size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end gap-3">
                  <p className="text-lg font-black text-gray-900">
                    {fmtStock(insumo.stock_actual, insumo.unidad)}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    Mín: {fmtStock(insumo.stock_minimo, insumo.unidad)}
                  </p>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-danger-500' : 'bg-success-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onOpenEditInsumo(insumo)}
                  className="flex-1 h-9 rounded-xl bg-primary-50 text-[10px] font-black text-primary-500 uppercase tracking-wider hover:bg-primary-500 hover:text-white transition-all"
                >
                  Ver Detalles
                </button>
                <button
                  onClick={() => onSetMovementModal(insumo)}
                  className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => onDeleteInsumo(insumo)}
                  title="Eliminar insumo"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-danger-50 text-rose-500 hover:bg-danger-100 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
