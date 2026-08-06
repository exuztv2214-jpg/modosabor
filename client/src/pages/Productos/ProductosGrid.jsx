import { Check, ChefHat, Copy, Eye, ImageOff, Pencil, Star, Trash2 } from 'lucide-react';

import { STROKE } from '../../lib/theme.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import { fmtMoney, rgba } from './utils';
import PriceSummary from './PriceSummary';

const CATEGORIA_FALLBACK = '#6B7280';

function Casilla({ marcada, onClick, titulo = 'Seleccionar' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition ${
        marcada
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-300 text-transparent hover:border-gray-500'
      }`}
    >
      <Check size={11} strokeWidth={3} />
    </button>
  );
}

/** Miniatura del producto. La foto se resolvía sin `resolveAssetUrl`. */
function Miniatura({ producto, categoriaInfo, size = 'h-14 w-14' }) {
  const src = resolveAssetUrl(producto.imagen);
  const color = categoriaInfo?.color || CATEGORIA_FALLBACK;

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-xl`}
      style={{ background: rgba(color, 0.12) }}
    >
      {src ? (
        <img src={src} alt={producto.nombre} className="h-full w-full object-cover" />
      ) : categoriaInfo?.icono ? (
        <span className="text-[22px]">{categoriaInfo.icono}</span>
      ) : (
        <ImageOff size={18} strokeWidth={STROKE} style={{ color }} />
      )}
    </div>
  );
}

function Etiquetas({ producto }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Number(producto.activo) !== 1 ? (
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          Inactivo
        </span>
      ) : null}
      {Number(producto.destacado) === 1 ? (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: '#FDF3D3', color: '#6B4108' }}
        >
          <Star size={10} strokeWidth={STROKE} />
          Destacado
        </span>
      ) : null}
      {producto.stockBajo ? (
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: '#FEF2F2', color: '#9E141E' }}
        >
          Stock bajo
        </span>
      ) : null}
      {producto.porReceta ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          <ChefHat size={10} strokeWidth={STROKE} />
          Por receta
        </span>
      ) : null}
    </div>
  );
}

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
  const color = categoriaInfo?.color || CATEGORIA_FALLBACK;

  return (
    /*
      La banda de arriba toma el color de la categoría, que ya está guardado
      en la base y hasta ahora sólo se usaba en un chip chiquito abajo de
      todo. Con la banda, una grilla de sesenta productos se lee por bloques
      —las pizzas juntas, las milanesas juntas— sin leer una palabra.
    */
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] ${
        active ? '' : 'opacity-70'
      }`}
      style={selected ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: rgba(color, 0.13) }}>
        <Casilla marcada={selected} onClick={() => onSelect(producto.id)} />
        <Miniatura producto={producto} categoriaInfo={categoriaInfo} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-gray-900">{producto.nombre}</p>
          <p className="mt-0.5 truncate text-[12px]" style={{ color }}>
            {categoriaInfo?.icono ? `${categoriaInfo.icono} ` : ''}
            {categoriaInfo?.nombre || 'Sin categoría'}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onView(producto)}
            title="Ver ficha"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-gray-900"
          >
            <Eye size={15} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(producto)}
            title="Duplicar"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-gray-900"
          >
            <Copy size={15} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(producto)}
            title="Editar"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-gray-900"
          >
            <Pencil size={15} strokeWidth={STROKE} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <Etiquetas producto={producto} />

        <p className="mt-2 line-clamp-2 min-h-[32px] text-[12px] leading-4 text-gray-500">
          {producto.descripcion || 'Sin descripción cargada.'}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">Precio</p>
            <PriceSummary
              options={producto.priceOptions}
              basePrice={producto.precio}
              singleClassName="mt-0.5 text-[17px] font-bold tabular-nums text-gray-900"
              multiClassName="mt-0.5 space-y-0.5"
              itemClassName="text-[13px] font-bold tabular-nums text-gray-900"
            />
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">
              {producto.porReceta ? 'Stock (receta)' : 'Stock'}
            </p>
            <p
              className="mt-0.5 text-[17px] font-bold tabular-nums"
              style={{ color: producto.stockBajo ? '#DC1F2D' : '#111827' }}
            >
              {producto.stock || 0}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-gray-400">
          <span>
            {producto.variantGroups.length}{' '}
            {producto.variantGroups.length === 1 ? 'variante' : 'variantes'}
          </span>
          <span>
            {producto.extrasList.length} {producto.extrasList.length === 1 ? 'extra' : 'extras'}
          </span>
          {Number(producto.costo || 0) > 0 ? (
            <span>Costo {fmtMoney(producto.costo)}</span>
          ) : (
            <span style={{ color: '#B45309' }}>Sin costo cargado</span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 pt-1">
          <button
            type="button"
            onClick={() => onToggle(producto)}
            className={`h-9 rounded-xl text-[12px] font-semibold transition ${
              active
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {active ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(producto)}
            title="Eliminar producto"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={15} strokeWidth={STROKE} />
          </button>
        </div>
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
  const color = categoriaInfo?.color || CATEGORIA_FALLBACK;

  return (
    <tr
      className={`border-b border-gray-100 transition ${selected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-3 py-3">
        <Casilla marcada={selected} onClick={() => onSelect(producto.id)} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Miniatura producto={producto} categoriaInfo={categoriaInfo} size="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-gray-900">{producto.nombre}</p>
            <p className="font-mono text-[11px] text-gray-400">{producto.codigo}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: rgba(color, 0.13), color }}
        >
          {categoriaInfo?.icono || ''} {categoriaInfo?.nombre || 'Sin categoría'}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <PriceSummary
          options={producto.priceOptions}
          basePrice={producto.precio}
          singleClassName="text-[13px] font-bold tabular-nums text-gray-900"
          multiClassName="space-y-0.5"
          itemClassName="text-[12px] font-bold tabular-nums text-gray-900"
        />
      </td>
      <td className="px-3 py-3 text-right">
        <span
          className="text-[13px] font-medium tabular-nums"
          style={{ color: producto.stockBajo ? '#DC1F2D' : '#374151' }}
        >
          {producto.stock || 0}
        </span>
      </td>
      <td className="px-3 py-3">
        <Etiquetas producto={producto} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => onView(producto)}
            title="Ver ficha"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
          >
            <Eye size={15} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(producto)}
            title="Duplicar"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
          >
            <Copy size={15} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(producto)}
            title="Editar"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
          >
            <Pencil size={15} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onToggle(producto)}
            className={`ml-1 h-8 rounded-lg px-2.5 text-[12px] font-semibold transition ${
              active
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {active ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(producto)}
            title="Eliminar"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={15} strokeWidth={STROKE} />
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
  hayFiltros,
  onLimpiarFiltros,
  onNuevo,
}) {
  if (loading) {
    return (
      <div className={`grid gap-3 ${viewMode === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}>
        {Array.from({ length: viewMode === 'grid' ? 6 : 4 }).map((_, index) => (
          <div key={index} className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-gray-600">
          {hayFiltros ? 'Ningún producto coincide' : 'Todavía no hay productos'}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">
          {hayFiltros
            ? 'Probá con otra búsqueda o sacá alguno de los filtros.'
            : 'Cargá el primero para que aparezca en el TPV y en la web.'}
        </p>
        <div className="mt-4 flex justify-center">
          {hayFiltros ? (
            <button
              type="button"
              onClick={onLimpiarFiltros}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Limpiar filtros
            </button>
          ) : (
            <button
              type="button"
              onClick={onNuevo}
              style={{ background: '#DC1F2D' }}
              className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              Cargar el primero
            </button>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 text-[11px] text-gray-500">
            <tr>
              <th className="px-3 py-2.5">
                <Casilla
                  marcada={isAllSelected}
                  onClick={onToggleSelectAll}
                  titulo="Seleccionar todo"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Producto</th>
              <th className="px-3 py-2.5 text-left font-medium">Categoría</th>
              <th className="px-3 py-2.5 text-right font-medium">Precio</th>
              <th className="px-3 py-2.5 text-right font-medium">Stock</th>
              <th className="px-3 py-2.5 text-left font-medium">Estado</th>
              <th className="px-3 py-2.5" />
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
  );
}
