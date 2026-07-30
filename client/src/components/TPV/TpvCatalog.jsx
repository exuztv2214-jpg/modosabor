import { ListPlus, Plus, Search, ShoppingCart, UtensilsCrossed } from 'lucide-react';

import { getPrimaryDisplayPrice, safeParseArray } from '../../lib/pedidoForm.js';
import { resolveAssetUrl } from '../../lib/assets.js';

const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

function stockLabel(producto) {
  const available = Number(
    producto.stock_disponible ?? producto.stock ?? producto.stock_directo ?? 0
  );
  if (producto.disponible_para_venta === false)
    return { text: 'Sin stock', tone: 'border-rose-200 bg-danger-50 text-danger-700' };
  if (available > 0 && available <= 2)
    return { text: 'Bajo', tone: 'border-amber-200 bg-warning-50 text-warning-700' };
  return null;
}

export default function TpvCatalog({
  busqueda,
  cajaAbierta,
  cartQtyByProductId,
  catActiva,
  categorias,
  onAddItem,
  onAddItemWithOptions,
  onBusquedaChange,
  onCatActivaChange,
  onGoCaja,
  onOpenCart,
  productosFiltrados,
  searchInputRef,
  total,
  totalItems,
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            value={busqueda}
            onChange={(event) => onBusquedaChange(event.target.value)}
            placeholder="Buscar producto... (/)"
            disabled={!cajaAbierta}
            className="h-12 w-full rounded-2xl border-none bg-gray-100 py-2 pl-12 pr-4 text-sm font-medium transition-all focus:bg-white focus:ring-2 focus:ring-[#5D87FF]/20"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => onCatActivaChange(null)}
            disabled={!cajaAbierta}
            className={`flex-shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${!catActiva ? 'bg-primary-500 text-white shadow-lg shadow-primary-100' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Todos
          </button>
          {categorias.map((categoria) => (
            <button
              key={categoria.id}
              type="button"
              onClick={() => onCatActivaChange(categoria.id)}
              disabled={!cajaAbierta}
              className={`flex-shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${catActiva === categoria.id ? 'bg-primary-500 text-white shadow-lg shadow-primary-100' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="mr-2">{categoria.icono}</span>
              {categoria.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-6">
        {!cajaAbierta ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/78 backdrop-blur-[2px]">
            <div className="rounded-[28px] border border-rose-100 bg-white px-8 py-7 text-center shadow-xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-500">
                Caja cerrada
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">
                Abre el turno para vender
              </h3>
              <p className="mt-2 text-sm font-medium text-gray-500">
                Hasta abrir caja, el catálogo queda bloqueado.
              </p>
              <button
                type="button"
                onClick={onGoCaja}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-rose-600 px-5 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-700"
              >
                Ir a caja
              </button>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {productosFiltrados.map((producto) => {
            const badge = stockLabel(producto);
            const primaryPrice = getPrimaryDisplayPrice(producto);
            const qtyInCart = Number(cartQtyByProductId[producto.id] || 0);
            const imageUrl = producto?.imagen ? resolveAssetUrl(producto.imagen) : null;
            const tieneExtrasOpcionales = safeParseArray(producto.extras).length > 0;
            const puedeVender = cajaAbierta && producto.disponible_para_venta !== false;

            return (
              <div
                key={producto.id}
                role="button"
                tabIndex={puedeVender ? 0 : -1}
                aria-disabled={!puedeVender}
                onClick={() => puedeVender && onAddItem(producto)}
                onKeyDown={(event) => {
                  if (puedeVender && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onAddItem(producto);
                  }
                }}
                className={`group relative flex flex-col rounded-[24px] border border-transparent bg-white p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)] active:scale-[0.98] ${!puedeVender ? 'cursor-not-allowed opacity-60 grayscale' : 'cursor-pointer shadow-sm'} ${qtyInCart > 0 ? 'border-primary-500/20 ring-2 ring-[#5D87FF]/50' : ''}`}
              >
                {tieneExtrasOpcionales && puedeVender ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddItemWithOptions?.(producto);
                    }}
                    title="Agregar con extras (ej: jugo y postre)"
                    className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-500 shadow-md transition hover:bg-primary-50 hover:text-primary-600"
                  >
                    <ListPlus size={14} />
                  </button>
                ) : null}
                <div className="relative mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-[20px] bg-[#F2F6FA] transition-all group-hover:scale-105">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={producto.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : producto.categoria_icono ? (
                    <span className="text-3xl opacity-40 grayscale">
                      {producto.categoria_icono}
                    </span>
                  ) : (
                    <UtensilsCrossed size={28} className="text-gray-300" strokeWidth={1.75} />
                  )}

                  {qtyInCart > 0 ? (
                    <div className="absolute left-2 top-2 flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-primary-500 px-1.5 text-xs font-black text-white shadow-lg animate-in zoom-in duration-300">
                      {qtyInCart}
                    </div>
                  ) : null}

                  {badge ? (
                    <div
                      className={`absolute right-2 top-2 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wider shadow-sm ${badge.tone}`}
                    >
                      {badge.text}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col">
                  <p className="mb-1 line-clamp-2 text-sm font-bold leading-tight text-gray-800 group-hover:text-primary-500">
                    {producto.nombre}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {producto.categoria_nombre || 'General'}
                  </p>

                  <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-3">
                    <div>
                      {primaryPrice.label ? (
                        <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-400">
                          {primaryPrice.label}
                        </p>
                      ) : null}
                      <p className="text-base font-black text-primary-500">
                        {fmt(primaryPrice.price)}
                      </p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-primary-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
                      <Plus size={16} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="mt-10 rounded-[32px] border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Search className="text-gray-300" size={32} />
            </div>
            <p className="text-base font-bold text-gray-500">
              No encontramos productos con ese filtro.
            </p>
            <button
              type="button"
              onClick={() => {
                onBusquedaChange('');
                onCatActivaChange(null);
              }}
              className="mt-4 text-sm font-bold text-primary-500 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>

      {totalItems > 0 ? (
        <button
          type="button"
          onClick={onOpenCart}
          className="fixed bottom-6 right-6 z-40 flex h-16 items-center gap-3 rounded-full bg-primary-500 px-6 text-white shadow-2xl shadow-blue-300 transition hover:scale-105 active:scale-95 lg:hidden"
        >
          <div className="relative">
            <ShoppingCart size={24} />
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-primary-500">
              {totalItems}
            </span>
          </div>
          <span className="text-sm font-black">{fmt(total)}</span>
        </button>
      ) : null}
    </section>
  );
}
