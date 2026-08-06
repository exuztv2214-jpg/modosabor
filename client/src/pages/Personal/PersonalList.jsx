import { ChevronRight, Search, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { AvatarDisplay, Empty } from './components.jsx';
import { fmt, rolLabel } from './constants.js';

const FILTROS = [
  { id: 'activos', label: 'Activos' },
  { id: 'todos', label: 'Todos' },
  { id: 'inactivos', label: 'Bajas' },
];

/**
 * Lista lateral del equipo.
 *
 * Antes era un `.map()` sobre todo el personal, sin buscador ni filtro, con
 * activos e inactivos mezclados y distinguidos sólo por un punto rojo de 12px.
 * Con diez personas ya obligaba a scrollear leyendo nombre por nombre.
 *
 * Ahora: buscador, filtro por estado y —lo importante para una lista de
 * sueldos— el saldo pendiente visible en la fila, que es el dato por el que
 * normalmente abrís esta pantalla.
 */
export function PersonalList({
  personal,
  selectedId,
  onSelectId,
  busqueda,
  onBusquedaChange,
  filtroEstado,
  onFiltroChange,
  totalSinFiltrar,
}) {
  return (
    <div className="lg:col-span-4">
      <div className="flex h-full max-h-[750px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="space-y-3 border-b border-gray-100 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-gray-900">Equipo</h3>
            <span className="text-[12px] text-gray-400">
              {personal.length}
              {personal.length !== totalSinFiltrar ? ` de ${totalSinFiltrar}` : ''}
            </span>
          </div>

          <div className="relative">
            <Search
              size={15}
              strokeWidth={STROKE}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={busqueda}
              onChange={(e) => onBusquedaChange(e.target.value)}
              placeholder="Buscar por nombre, rol o teléfono"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-[13px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
            {busqueda ? (
              <button
                type="button"
                onClick={() => onBusquedaChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                title="Limpiar"
              >
                <X size={14} strokeWidth={STROKE} />
              </button>
            ) : null}
          </div>

          <div className="flex rounded-xl bg-gray-100 p-1">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFiltroChange(f.id)}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium transition ${
                  filtroEstado === f.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
          {personal.length === 0 ? (
            <Empty
              title={busqueda ? 'Sin resultados' : 'No hay nadie en este filtro'}
              description={
                busqueda
                  ? `Ningún miembro coincide con "${busqueda}".`
                  : 'Probá cambiando el filtro de estado.'
              }
            />
          ) : (
            personal.map((item) => {
              const activo = String(selectedId) === String(item.id);
              const debe = Number(item.pendiente_total || 0) > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectId(String(item.id))}
                  className={`group relative flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition ${
                    activo ? 'bg-rose-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Barra de selección: se lee de un vistazo cuál está abierto,
                      sin depender de un cambio sutil de fondo. */}
                  {activo ? (
                    <span
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                      style={{ background: BRAND }}
                    />
                  ) : null}

                  <div className="relative shrink-0">
                    <AvatarDisplay
                      url={item.avatar_url}
                      seed={item.id}
                      nombre={item.nombre}
                      size="h-10 w-10"
                    />
                    {!item.activo ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                        style={{ background: '#9CA3AF' }}
                        title="Dado de baja"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-medium"
                      style={{ color: activo ? BRAND : '#111827' }}
                    >
                      {item.nombre}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-gray-500">
                      <span>{rolLabel(item.rol_operativo)}</span>
                      {debe ? (
                        <>
                          <span className="text-gray-300">·</span>
                          <span style={{ color: BRAND }}>debe {fmt(item.pendiente_total)}</span>
                        </>
                      ) : null}
                      {!item.activo ? (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>baja</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <ChevronRight
                    size={15}
                    strokeWidth={STROKE}
                    className={activo ? '' : 'text-gray-300'}
                    style={activo ? { color: BRAND } : undefined}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
