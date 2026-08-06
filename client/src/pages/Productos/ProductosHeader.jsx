import { Eye, EyeOff, LayoutGrid, List, Plus, RefreshCw, Search, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Stat } from '../Clientes/clientesUi.jsx';
import { CONTROL, fmtMoney } from './utils';

// `CONTROL` estaba definido acá y también exportado desde `utils.js`, con la
// única diferencia de un `w-full`. Dos fuentes de verdad para el mismo input:
// tocabas una y la otra quedaba distinta. El ancho va en el uso puntual.
const SELECT =
  'h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

export default function ProductosHeader({
  stats,
  busqueda,
  onBusquedaChange,
  filtroCategoria,
  onFiltroCategoriaChange,
  filtroEstado,
  onFiltroEstadoChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  categorias,
  loading,
  onRecargar,
  onNuevo,
  filteredCount,
  selectedCount,
  onBulkActivo,
  onClearSelected,
  hayFiltros,
  onLimpiarFiltros,
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Productos</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {stats.total === 0
              ? 'Todavía no hay productos cargados'
              : `${stats.total} en el catálogo · ${stats.activos} activos`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNuevo}
            style={{ background: BRAND }}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <Plus size={16} strokeWidth={STROKE} />
            Nuevo producto
          </button>

          <div className="flex rounded-xl bg-gray-200/70 p-1">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              title="Ver como tarjetas"
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <LayoutGrid size={16} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title="Ver como lista"
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <List size={16} strokeWidth={STROKE} />
            </button>
          </div>

          <button
            type="button"
            onClick={onRecargar}
            title="Actualizar"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
          >
            <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/*
        Eran cinco tarjetas: total, activos, destacados, stock bajo e
        inventario. "Total" y "activos" ya están en el subtítulo de arriba, y
        "destacados" no es algo que se accione. Quedan las cuatro que sí
        piden hacer algo cuando el número sube.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Stock bajo"
          value={stats.stockBajo}
          helper={stats.stockBajo > 0 ? 'Menos de 10 unidades' : 'Nada por reponer'}
          alerta={stats.stockBajo > 0}
        />
        <Stat
          label="Sin publicar"
          value={stats.inactivos}
          helper="No se ven en el TPV ni en la web"
          tono="ambar"
        />
        <Stat
          label="Sin costo cargado"
          value={stats.sinCosto}
          helper="Sin costo, el margen del día sale mal"
          tono={stats.sinCosto > 0 ? 'ambar' : 'verde'}
        />
        <Stat
          label="Valor del inventario"
          value={fmtMoney(stats.inventario)}
          helper="Costo por stock actual"
          tono="verde"
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={STROKE}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={busqueda}
              onChange={(event) => onBusquedaChange(event.target.value)}
              placeholder="Buscar por nombre, código o descripción"
              className={`${CONTROL} w-full pl-9`}
            />
          </div>

          <select
            value={filtroCategoria}
            onChange={(event) => onFiltroCategoriaChange(event.target.value)}
            className={SELECT}
          >
            <option value="todas">Todas las categorías</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={String(categoria.id)}>
                {categoria.nombre}
              </option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(event) => onFiltroEstadoChange(event.target.value)}
            className={SELECT}
          >
            <option value="todos">Activos e inactivos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => onSortByChange(event.target.value)}
            className={SELECT}
          >
            <option value="nombre">Ordenar por nombre</option>
            <option value="precio">Por precio</option>
            <option value="stock">Por stock</option>
            <option value="categoria">Por categoría</option>
          </select>
        </div>

        {hayFiltros ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <p className="text-[12px] text-gray-500">
              {filteredCount === 0 ? (
                'Ningún producto coincide'
              ) : (
                <>
                  Mostrando <span className="font-semibold text-gray-900">{filteredCount}</span> de{' '}
                  {stats.total}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={onLimpiarFiltros}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
            >
              <X size={13} strokeWidth={STROKE} />
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>

      {/*
        La barra de selección múltiple estaba metida dentro del panel de
        filtros y sólo se veía si el panel quedaba en pantalla. Ahora es una
        barra propia que aparece únicamente cuando hay algo seleccionado.
      */}
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3">
          <span className="text-[13px] font-semibold text-white">
            {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBulkActivo(1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-[12px] font-semibold text-white transition hover:bg-white/25"
            >
              <Eye size={14} strokeWidth={STROKE} />
              Activar
            </button>
            <button
              type="button"
              onClick={() => onBulkActivo(0)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-[12px] font-semibold text-white transition hover:bg-white/25"
            >
              <EyeOff size={14} strokeWidth={STROKE} />
              Desactivar
            </button>
            <button
              type="button"
              onClick={onClearSelected}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white/70 transition hover:text-white"
            >
              <X size={14} strokeWidth={STROKE} />
              Limpiar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
