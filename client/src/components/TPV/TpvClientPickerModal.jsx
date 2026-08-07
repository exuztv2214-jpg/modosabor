import { Search, X } from 'lucide-react';

export default function TpvClientPickerModal({
  clientesCatalogo,
  loadingClientesCatalogo,
  onApplyCliente,
  onClose,
  onSearchChange,
  search,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-lg font-black text-gray-900">Seleccionar cliente</p>
            <p className="text-sm font-medium text-gray-500">
              Busca por nombre, telefono, direccion o codigo de tarjeta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-gray-200 px-5 py-4">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar cliente o tarjeta..."
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-11 pr-4 text-sm font-medium focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loadingClientesCatalogo ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm font-semibold text-gray-400">
              Cargando clientes...
            </div>
          ) : null}

          {!loadingClientesCatalogo && clientesCatalogo.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm font-semibold text-gray-400">
              No encontramos clientes para esa busqueda.
            </div>
          ) : null}

          {!loadingClientesCatalogo && clientesCatalogo.length > 0 ? (
            <div className="space-y-3">
              {clientesCatalogo.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onApplyCliente(item)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900">
                        {item.nombre || 'Sin nombre'}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {item.telefono || 'Sin telefono'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-gray-500">
                        {item.direccion || 'Sin direccion cargada'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.codigo_tarjeta ? (
                          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                            {item.codigo_tarjeta}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-warning-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-warning-600">
                          {Number(item.puntos || 0)} pts
                        </span>
                        {Number(item.recompensas_pendientes || 0) > 0 ? (
                          <span className="rounded-full bg-success-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-success-600">
                            {Number(item.recompensas_pendientes || 0)} premio
                            {Number(item.recompensas_pendientes || 0) === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                      {Number(item.total_pedidos || 0)} pedidos
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
