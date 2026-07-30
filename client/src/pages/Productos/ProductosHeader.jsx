import {
  Package,
  Sparkles,
  Star,
  AlertTriangle,
  CircleDollarSign,
  RefreshCw,
  LayoutGrid,
  List,
  Plus,
  Search,
  CheckSquare,
  Square,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { fmtMoney, rgba } from './utils';

function StatCard({ label, value, icon: Icon, tone, helper }) {
  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#D7E3FF] hover:shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-black tracking-tight text-gray-900">{value}</p>
          {helper && <p className="mt-1 text-xs text-gray-500">{helper}</p>}
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: rgba(tone, 0.14), color: tone }}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

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
  isAllSelected,
  onToggleSelectAll,
  selectedCount,
  onBulkActivo,
  onClearSelected,
}) {
  return (
    <>
      <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 shadow-sm sm:flex">
              <Package size={28} />
            </div>
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-500">
                Catálogo de productos
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
                Productos
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Catálogo operativo con foco en imagen, precio, stock y estructura de variantes para
                mantener coherencia con TPV, dashboard y web pública.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRecargar}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Recargar
            </button>

            <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
              >
                <LayoutGrid size={14} />
                Grid
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
              >
                <List size={14} />
                Lista
              </button>
            </div>

            <button
              type="button"
              onClick={onNuevo}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(93,135,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#4a74ef]"
            >
              <Plus size={15} />
              Nuevo producto
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total" value={stats.total} icon={Package} tone="#5D87FF" />
        <StatCard label="Activos" value={stats.activos} icon={Sparkles} tone="#13DEB9" />
        <StatCard label="Destacados" value={stats.destacados} icon={Star} tone="#FFAE1F" />
        <StatCard label="Stock bajo" value={stats.stockBajo} icon={AlertTriangle} tone="#FA896B" />
        <StatCard
          label="Inventario"
          value={fmtMoney(stats.inventario)}
          icon={CircleDollarSign}
          tone="#49BEFF"
          helper="Costo x stock"
        />
      </section>

      <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(event) => onBusquedaChange(event.target.value)}
              placeholder="Buscar productos..."
              className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-[#5D87FF]/10"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={filtroCategoria}
              onChange={(event) => onFiltroCategoriaChange(event.target.value)}
              className="h-11 min-w-[180px] rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-[#5D87FF]/10"
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
              className="h-11 min-w-[140px] rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-[#5D87FF]/10"
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value)}
              className="h-11 min-w-[150px] rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-[#5D87FF]/10"
            >
              <option value="nombre">Nombre</option>
              <option value="precio">Precio</option>
              <option value="stock">Stock</option>
              <option value="categoria">Categoría</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <button
            type="button"
            onClick={onToggleSelectAll}
            title={isAllSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-primary-500/30 hover:text-primary-500"
          >
            {isAllSelected ? <CheckSquare size={13} /> : <Square size={13} />}
            Sel. todos
          </button>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            {filteredCount} visibles
          </span>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 font-semibold text-primary-500">
            {viewMode === 'grid' ? 'Vista tarjetas' : 'Vista tabla'}
          </span>
          <span className="rounded-full bg-[#E8F7FF] px-3 py-1.5 font-semibold text-info-500">
            Variantes y extras integrados
          </span>
        </div>

        {selectedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[#D7E3FF] bg-primary-50 px-5 py-3">
            <span className="text-sm font-bold text-primary-500">
              {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => onBulkActivo(1)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-success-500 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
            >
              <Eye size={14} />
              Activar todos
            </button>
            <button
              type="button"
              onClick={() => onBulkActivo(0)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-warning-500 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 active:scale-95"
            >
              <EyeOff size={14} />
              Desactivar todos
            </button>
            <button
              type="button"
              onClick={onClearSelected}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-xl border border-[#B7CEFF] bg-white px-4 text-xs font-bold text-primary-500 transition hover:bg-[#DDE9FF]"
            >
              <X size={13} />
              Limpiar
            </button>
          </div>
        )}
      </section>
    </>
  );
}
