import { CheckSquare, Eye, Copy, Pencil, Trash2, Star } from 'lucide-react';
import { fmtMoney, rgba, getPricingOptionTotals } from './utils';
import PriceSummary from './PriceSummary';

function ProductCard({
  producto,
  categoriaInfo,
  onView,
  onEdit,
  onToggle,
  onDelete,
  onDuplicate,
  selected,
  onSelect,
}) {
  const active = Number(producto.activo) === 1;
  const stockLow = Number(producto.stock || 0) < 10;
  const priceOptions = getPricingOptionTotals(
    categoriaInfo?.nombre,
    producto.precio,
    producto.variantGroups
  );

  return (
    <article
      className={`group flex h-full flex-col rounded-[26px] border bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${selected ? 'border-[#8DAEFF] ring-2 ring-[#D7E3FF]' : 'border-gray-100 hover:border-[#D7E3FF]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onSelect(producto.id)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 text-transparent hover:border-primary-500'}`}
            title="Seleccionar"
          >
            {selected && <CheckSquare size={12} strokeWidth={3} />}
          </button>
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white shadow-sm"
            style={{ backgroundColor: rgba(categoriaInfo?.color, 0.14) }}
          >
            {producto.imagen ? (
              <img
                src={producto.imagen}
                alt={producto.nombre}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[28px]">{categoriaInfo?.icono || '🍽️'}</span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
              {producto.codigo}
            </p>
            <h3 className="truncate text-lg font-black tracking-tight text-gray-900">
              {producto.nombre}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
              >
                {active ? 'Activo' : 'Inactivo'}
              </span>
              {producto.destacado === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold text-warning-700">
                  <Star size={12} />
                  Destacado
                </span>
              )}
              {stockLow && (
                <span className="rounded-full bg-danger-50 px-2.5 py-1 text-[11px] font-bold text-danger-700">
                  Stock bajo
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onView(producto)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-[#B7CEFF] hover:bg-primary-50 hover:text-primary-500"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(producto)}
            title="Duplicar producto"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(producto)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-[#B7CEFF] hover:bg-primary-50 hover:text-primary-500"
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="line-clamp-2 text-sm leading-6 text-gray-500">
          {producto.descripcion || 'Sin descripción cargada por ahora.'}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Precio</p>
          <PriceSummary
            options={priceOptions}
            basePrice={producto.precio}
            singleClassName="mt-1 text-xl font-black tracking-tight text-primary-500"
            multiClassName="mt-1 space-y-1"
            itemClassName="text-sm font-black tracking-tight text-primary-500"
          />
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Stock</p>
          <p
            className={`mt-1 text-xl font-black tracking-tight ${stockLow ? 'text-danger-600' : 'text-gray-900'}`}
          >
            {producto.stock || 0}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className="rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: rgba(categoriaInfo?.color, 0.12),
            color: categoriaInfo?.color || '#f97316',
          }}
        >
          {categoriaInfo?.icono || '🍽️'} {categoriaInfo?.nombre || 'Sin categoría'}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
          {producto.variantGroups.length} grupo{producto.variantGroups.length === 1 ? '' : 's'} de
          variantes
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
          {producto.extrasList.length} extra{producto.extrasList.length === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
          {producto.stock_mode === 'recipe' ? 'Stock por receta' : 'Stock directo'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggle(producto)}
          className={`h-10 rounded-2xl text-sm font-bold transition ${active ? 'bg-warning-50 text-warning-700 hover:bg-warning-100' : 'bg-success-50 text-success-700 hover:bg-success-100'}`}
        >
          {active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          type="button"
          onClick={() => onDelete(producto)}
          className="h-10 rounded-2xl border border-rose-200 text-sm font-bold text-danger-600 transition hover:bg-danger-50"
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}

function ProductRow({
  producto,
  categoriaInfo,
  onView,
  onEdit,
  onToggle,
  onDelete,
  onDuplicate,
  selected,
  onSelect,
}) {
  const active = Number(producto.activo) === 1;
  const stockLow = Number(producto.stock || 0) < 10;
  const priceOptions = getPricingOptionTotals(
    categoriaInfo?.nombre,
    producto.precio,
    producto.variantGroups
  );

  return (
    <tr
      className={`border-b border-slate-100 transition hover:bg-slate-50 ${selected ? 'bg-primary-50' : ''}`}
    >
      <td className="px-3 py-4 text-center">
        <button
          type="button"
          onClick={() => onSelect(producto.id)}
          className={`mx-auto flex h-5 w-5 items-center justify-center rounded-md border transition ${selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 text-transparent hover:border-primary-500'}`}
        >
          {selected && <CheckSquare size={12} strokeWidth={3} />}
        </button>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white text-2xl"
            style={{ backgroundColor: rgba(categoriaInfo?.color, 0.14) }}
          >
            {producto.imagen ? (
              <img
                src={producto.imagen}
                alt={producto.nombre}
                className="h-full w-full object-cover"
              />
            ) : (
              categoriaInfo?.icono || '🍽️'
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-gray-900">{producto.nombre}</p>
            <p className="text-xs text-gray-400">{producto.codigo}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <span
          className="rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: rgba(categoriaInfo?.color, 0.12),
            color: categoriaInfo?.color || '#f97316',
          }}
        >
          {categoriaInfo?.icono || '🍽️'} {categoriaInfo?.nombre || 'Sin categoría'}
        </span>
      </td>
      <td className="px-5 py-4 text-right font-black text-gray-900">
        <PriceSummary
          options={priceOptions}
          basePrice={producto.precio}
          singleClassName=""
          multiClassName="space-y-1 text-xs font-bold text-primary-500"
          itemClassName=""
        />
      </td>
      <td className="px-5 py-4 text-center">
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${stockLow ? 'bg-danger-50 text-danger-700' : 'bg-gray-100 text-gray-600'}`}
        >
          {producto.stock || 0} uds
        </span>
      </td>
      <td className="px-5 py-4 text-center">
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${active ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
        >
          {active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-5 py-4 text-center text-sm font-semibold text-gray-600">
        {producto.variantGroups.length}/{producto.extrasList.length}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onView(producto)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-[#B7CEFF] hover:bg-primary-50 hover:text-primary-500"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(producto)}
            title="Duplicar producto"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(producto)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-[#B7CEFF] hover:bg-primary-50 hover:text-primary-500"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onToggle(producto)}
            className={`flex h-9 items-center justify-center rounded-xl px-3 text-xs font-bold transition ${active ? 'bg-warning-50 text-warning-700 hover:bg-warning-100' : 'bg-success-50 text-success-700 hover:bg-success-100'}`}
          >
            {active ? 'Off' : 'On'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(producto)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-danger-600 transition hover:bg-danger-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ProductosGrid({
  loading,
  viewMode,
  filtered,
  selectedIds,
  onView,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
  onSelect,
  isAllSelected,
  onToggleSelectAll,
}) {
  return (
    <div className="mt-5">
      {loading ? (
        <div
          className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}
        >
          {Array.from({ length: viewMode === 'grid' ? 6 : 3 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-[24px] bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-gray-200 bg-slate-50 px-6 py-16 text-center">
          <h3 className="text-lg font-black tracking-tight text-gray-900">No hay resultados</h3>
          <p className="mt-2 text-sm text-gray-500">Proba otro filtro o crea un producto nuevo.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((producto) => (
            <ProductCard
              key={producto.id}
              producto={producto}
              categoriaInfo={producto.categoriaInfo}
              onView={onView}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onToggle={onToggle}
              onDelete={onDelete}
              selected={selectedIds.includes(producto.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-gray-100 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-3 py-4 text-center">
                    <button
                      type="button"
                      onClick={onToggleSelectAll}
                      className={`mx-auto flex h-5 w-5 items-center justify-center rounded-md border transition ${isAllSelected ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 text-transparent hover:border-primary-500'}`}
                    >
                      {isAllSelected && <CheckSquare size={12} strokeWidth={3} />}
                    </button>
                  </th>
                  <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Producto
                  </th>
                  <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Categoría
                  </th>
                  <th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Precio
                  </th>
                  <th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Stock
                  </th>
                  <th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Estado
                  </th>
                  <th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Var/Ext
                  </th>
                  <th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((producto) => (
                  <ProductRow
                    key={producto.id}
                    producto={producto}
                    categoriaInfo={producto.categoriaInfo}
                    onView={onView}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    selected={selectedIds.includes(producto.id)}
                    onSelect={onSelect}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
