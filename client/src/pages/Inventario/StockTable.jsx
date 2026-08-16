import { Download, History, Pencil, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { BRAND, STROKE } from '../../lib/theme.js';
import { fmtMoney } from '../../lib/formatters.js';
import { fmtStock } from './utils';

const VERDE = '#047857';

/**
 * Porcentaje de la barra de stock.
 *
 * Se calculaba como `stock / (minimo * 3)`. Con un insumo sin mínimo cargado
 * eso es `0/0`, o sea `NaN`, y terminaba en `width: NaN%`: la barra no se
 * dibujaba y no había forma de saber por qué.
 */
function nivelStock(insumo) {
  const actual = Number(insumo.stock_actual || 0);
  const minimo = Number(insumo.stock_minimo || 0);
  if (minimo <= 0) return { pct: actual > 0 ? 100 : 0, sinMinimo: true };
  return { pct: Math.min(100, Math.max(0, (actual / (minimo * 3)) * 100)), sinMinimo: false };
}

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
    <div className="space-y-4">
      {sharedBases.length > 0 ? (
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Bases compartidas</h3>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Si una de estas se queda sin stock, frena varios productos a la vez
              </p>
            </div>
            <Link
              to="/admin/operacion"
              className="inline-flex h-9 shrink-0 items-center rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Abrir control diario
            </Link>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sharedBases.slice(0, 9).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onSetMovementModal(item)}
                className="rounded-xl bg-gray-50 p-3 text-left transition hover:bg-gray-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-gray-900">{item.nombre}</p>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={
                      item.stock_bajo
                        ? { background: '#FEF2F2', color: '#9E141E' }
                        : { background: '#E7F5EF', color: '#0F6E56' }
                    }
                  >
                    {item.stock_bajo ? 'Bajo' : 'OK'}
                  </span>
                </div>
                <p
                  className="mt-1 text-[17px] font-bold tabular-nums"
                  style={{ color: item.stock_bajo ? BRAND : '#111827' }}
                >
                  {fmtStock(item.stock_actual, item.unidad)}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {item.dependencias}{' '}
                  {item.dependencias === 1 ? 'producto depende' : 'productos dependen'}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-gray-900">Insumos</h3>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search
                size={16}
                strokeWidth={STROKE}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={busqueda}
                onChange={(e) => onSetBusqueda(e.target.value)}
                placeholder="Buscar por nombre o rubro"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
              />
            </div>
            <button
              type="button"
              onClick={onExportarInsumosCSV}
              title="Exportar CSV"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <Download size={16} strokeWidth={STROKE} />
            </button>
          </div>
        </div>

        {/* No había estado vacío: buscar algo que no existe dejaba un hueco
            blanco sin explicación. */}
        {filteredInsumos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="text-[14px] font-medium text-gray-600">
              {busqueda.trim() ? 'Ningún insumo coincide' : 'Todavía no hay insumos'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">
              {busqueda.trim()
                ? 'Probá con otro nombre o rubro.'
                : 'Los insumos son la materia prima que descuentan las recetas.'}
            </p>
            {busqueda.trim() ? (
              <button
                type="button"
                onClick={() => onSetBusqueda('')}
                className="mt-4 h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Limpiar búsqueda
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredInsumos.map((insumo) => {
              const { pct, sinMinimo } = nivelStock(insumo);
              const bajo = insumo.stock_bajo;
              const inactivo = Number(insumo.activo) !== 1;

              return (
                <div
                  key={insumo.id}
                  className={`group rounded-xl border border-gray-100 p-3 transition hover:border-gray-200 ${
                    inactivo ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {insumo.nombre}
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        {insumo.rubro}
                        {inactivo ? ' · sin uso' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenEditInsumo(insumo)}
                      title="Editar insumo"
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
                    >
                      <Pencil size={14} strokeWidth={STROKE} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p
                      className="text-[18px] font-bold tabular-nums leading-none"
                      style={{ color: bajo ? BRAND : '#111827' }}
                    >
                      {fmtStock(insumo.stock_actual, insumo.unidad)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {sinMinimo
                        ? 'sin mínimo'
                        : `mín ${fmtStock(insumo.stock_minimo, insumo.unidad)}`}
                    </p>
                  </div>

                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: bajo ? BRAND : VERDE }}
                    />
                  </div>

                  {/* El costo sólo se veía abriendo el editor, aunque es el
                      dato que necesitás para decidir una compra. */}
                  <p className="mt-2 text-[11px] text-gray-400">
                    {Number(insumo.costo_unitario || 0) > 0 ? (
                      <>
                        {fmtMoney(insumo.costo_unitario)} por {insumo.unidad}
                      </>
                    ) : (
                      <span style={{ color: '#B45309' }}>Sin costo cargado</span>
                    )}
                  </p>

                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSetMovementModal(insumo)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <History size={13} strokeWidth={STROKE} />
                      Ajustar stock
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteInsumo(insumo)}
                      title="Eliminar insumo"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} strokeWidth={STROKE} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
