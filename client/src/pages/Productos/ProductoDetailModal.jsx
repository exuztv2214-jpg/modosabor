import { X } from 'lucide-react';
import {
  fmtMoney,
  rgba,
  getPricingOptionTotals,
  getStructuredPricingConfig,
  normalizeExtras,
} from './utils';
import PriceSummary from './PriceSummary';

export default function ProductoDetailModal({ detalle, onClose, onEdit }) {
  if (!detalle) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="h-56"
            style={{
              background: `linear-gradient(135deg, ${rgba(detalle.categoriaInfo?.color, 0.28)}, ${rgba(detalle.categoriaInfo?.color, 0.06)})`,
            }}
          />
          <div className="-mt-10 px-5 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white text-4xl shadow-sm"
                style={{ backgroundColor: rgba(detalle.categoriaInfo?.color, 0.14) }}
              >
                {detalle.imagen ? (
                  <img
                    src={detalle.imagen}
                    alt={detalle.nombre}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  detalle.categoriaInfo?.icono || '🍽️'
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
              {detalle.codigo}
            </p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-gray-950">
              {detalle.nombre}
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {detalle.descripcion || 'Sin descripción cargada.'}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Precio
                </p>
                <PriceSummary
                  options={getPricingOptionTotals(
                    detalle.categoriaInfo?.nombre,
                    detalle.precio,
                    detalle.variantGroups
                  )}
                  basePrice={detalle.precio}
                  singleClassName="mt-1 font-semibold text-primary-500"
                  multiClassName="mt-1 space-y-1 text-xs font-semibold text-primary-500"
                  itemClassName=""
                />
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Costo
                </p>
                <p className="mt-1 font-semibold text-gray-900">{fmtMoney(detalle.costo)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Stock
                </p>
                <p className="mt-1 font-semibold text-gray-900">{detalle.stock || 0} uds</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Tiempo
                </p>
                <p className="mt-1 font-semibold text-gray-900">
                  {detalle.tiempo_preparacion || 0} min
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: rgba(detalle.categoriaInfo?.color, 0.12),
                  color: detalle.categoriaInfo?.color || '#f97316',
                }}
              >
                {detalle.categoriaInfo?.icono || '🍽️'}{' '}
                {detalle.categoriaInfo?.nombre || 'Sin categoría'}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                {detalle.stock_mode === 'recipe' ? 'Stock por receta' : 'Stock directo'}
              </span>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${Number(detalle.activo) === 1 ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
              >
                {Number(detalle.activo) === 1 ? 'Activo' : 'Inactivo'}
              </span>
              {Number(detalle.destacado) === 1 && (
                <span className="rounded-full bg-warning-50 px-3 py-1.5 text-xs font-semibold text-warning-700">
                  Destacado
                </span>
              )}
            </div>

            {detalle.variantGroups.length > 0 && (
              <div className="mt-5 rounded-[24px] border border-gray-200 bg-gray-50/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                  Variantes
                </p>
                <div className="mt-3 space-y-3">
                  {detalle.variantGroups.map((group, index) => (
                    <div
                      key={`detail-group-${index}`}
                      className="rounded-2xl bg-white p-3 shadow-sm"
                    >
                      <p className="font-bold text-gray-900">{group.nombre}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(group.opciones || []).map((option, optionIndex) => (
                          <span
                            key={`detail-option-${index}-${optionIndex}`}
                            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600"
                          >
                            {option.nombre}{' '}
                            {getStructuredPricingConfig(detalle.categoriaInfo?.nombre)
                              ? `- ${fmtMoney(detalle.precio + Number(option.precio_extra || 0))}`
                              : Number(option.precio_extra) > 0
                                ? `+${fmtMoney(option.precio_extra)}`
                                : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detalle.extrasList.length > 0 && (
              <div className="mt-5 rounded-[24px] border border-gray-200 bg-gray-50/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                  Extras
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {detalle.extrasList.map((extra, index) => (
                    <span
                      key={`detail-extra-${index}`}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
                    >
                      {extra.nombre} +{fmtMoney(extra.precio)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-gray-200 px-5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              const current = detalle;
              onClose();
              onEdit(current);
            }}
            className="h-11 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white transition hover:bg-[#4A74EF]"
          >
            Editar producto
          </button>
        </div>
      </div>
    </div>
  );
}
