import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ListPlus, Minus, Plus, Search, ShoppingCart, UtensilsCrossed } from 'lucide-react';

import { getPrimaryDisplayPrice } from '../../lib/pedidoForm.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import { BRAND, fmt, STROKE } from './tpvUi.jsx';

function ProductThumb({ producto, imageUrl }) {
  const [broken, setBroken] = useState(false);

  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={producto.nombre}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        onError={() => setBroken(true)}
      />
    );
  }
  if (producto.categoria_icono) {
    return <span className="text-4xl opacity-30 grayscale">{producto.categoria_icono}</span>;
  }
  return <UtensilsCrossed size={28} strokeWidth={1.4} className="text-gray-300" />;
}

/**
 * Tarjeta de categoría: cuadrada, chica, con imagen arriba y nombre abajo.
 *
 * La imagen ayuda a encontrar la categoría en periferia, sin leer — que es
 * como se usa el TPV cuando hay cola. Si la categoría no tiene foto cargada
 * cae al emoji, y si tampoco tiene emoji muestra la inicial. Nunca queda un
 * hueco vacío.
 */
function CategoryCard({ categoria, activa, disabled, cantidad, onClick }) {
  const [broken, setBroken] = useState(false);
  const url = categoria?.imagen ? resolveAssetUrl(categoria.imagen) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={categoria.nombre}
      aria-pressed={activa}
      className={`flex h-[92px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-white px-1.5 transition-all active:scale-95 ${activa ? '' : 'border-transparent shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-gray-200'}`}
      style={activa ? { borderColor: BRAND } : undefined}
    >
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gray-50">
        {url && !broken ? (
          <img
            src={url}
            alt=""
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : categoria.icono ? (
          <span className="text-lg leading-none">{categoria.icono}</span>
        ) : (
          <span className="text-sm font-semibold text-gray-400">
            {String(categoria.nombre || '?').charAt(0)}
          </span>
        )}
      </span>
      <span
        className={`line-clamp-2 text-center text-[11px] leading-tight ${activa ? 'font-semibold' : 'font-medium text-gray-600'}`}
        style={activa ? { color: BRAND } : undefined}
      >
        {categoria.nombre}
      </span>
      {Number.isFinite(cantidad) ? (
        <span className="text-[9px] font-medium tabular-nums text-gray-400">
          {cantidad} {cantidad === 1 ? 'item' : 'items'}
        </span>
      ) : null}
    </button>
  );
}

function stockBadge(producto) {
  const available = Number(
    producto.stock_disponible ?? producto.stock ?? producto.stock_directo ?? 0
  );
  if (producto.disponible_para_venta === false) return { text: 'Sin stock', dot: 'bg-gray-400' };
  if (available > 0 && available <= 2) return { text: `Quedan ${available}`, dot: 'bg-amber-400' };
  return { text: 'Disponible', dot: 'bg-emerald-500' };
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-white p-2.5">
          <div className="aspect-[4/3] animate-pulse rounded-xl bg-gray-100" />
          <div className="mt-3 h-3 w-3/4 animate-pulse rounded-full bg-gray-100" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/**
 * Catálogo de productos.
 *
 * La foto es la protagonista: ocupa el 60% de la tarjeta en formato 4:3.
 * Eso es lo que separa un catálogo que se ve profesional de uno que no —
 * mucho más que cualquier decisión de tipografía o color.
 *
 * El resto de la tarjeta es deliberadamente sobrio: nombre en 600, precio
 * en rojo de marca, y un botón de agregar. Nada de badges de colores
 * peleando entre sí.
 */
export default function TpvCatalog({
  busqueda,
  cajaAbierta,
  cartQtyByProductId,
  cartLinesByProductId = {},
  catActiva,
  categorias,
  conteoPorCategoria = {},
  totalProductos,
  cargando = false,
  onAddItem,
  onAddItemWithOptions,
  onRestarItem,
  onBusquedaChange,
  onCatActivaChange,
  onGoCaja,
  onOpenCart,
  productosRapidos = [],
  productosFiltrados,
  searchInputRef,
  total,
  totalItems,
}) {
  const gridRef = useRef(null);
  const productRefs = useRef([]);
  const [productoActivoId, setProductoActivoId] = useState(null);

  useEffect(() => {
    if (!productosFiltrados.some((producto) => producto.id === productoActivoId)) {
      setProductoActivoId(productosFiltrados[0]?.id ?? null);
    }
  }, [productoActivoId, productosFiltrados]);

  const focusProducto = (index) => {
    const siguiente = productosFiltrados[index];
    if (!siguiente) return;
    setProductoActivoId(siguiente.id);
    productRefs.current[index]?.focus();
  };

  const moverProducto = (actual, tecla) => {
    const total = productosFiltrados.length;
    if (!total) return;
    const columnas = Math.max(1, Math.round(gridRef.current?.clientWidth / 165) || 1);
    let siguiente = actual;
    if (tecla === 'ArrowLeft') siguiente = Math.max(0, actual - 1);
    if (tecla === 'ArrowRight') siguiente = Math.min(total - 1, actual + 1);
    if (tecla === 'ArrowUp') siguiente = Math.max(0, actual - columnas);
    if (tecla === 'ArrowDown') siguiente = Math.min(total - 1, actual + columnas);
    focusProducto(siguiente);
  };

  const manejarTeclaBusqueda = (event) => {
    if (event.key === 'ArrowDown' && productosFiltrados.length) {
      event.preventDefault();
      const indice = Math.max(
        0,
        productosFiltrados.findIndex((p) => p.id === productoActivoId)
      );
      focusProducto(indice);
    }
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-5 pb-3 pt-3">
        <div className="relative">
          <Search
            size={17}
            strokeWidth={STROKE}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            ref={searchInputRef}
            value={busqueda}
            onChange={(event) => onBusquedaChange(event.target.value)}
            onKeyDown={manejarTeclaBusqueda}
            placeholder="Buscar producto…"
            disabled={!cajaAbierta}
            className="h-11 w-full rounded-xl border border-transparent bg-white pl-11 pr-12 text-sm font-medium text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-gray-400 focus:border-brand-200"
          />
          <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-400">
            /
          </kbd>
        </div>

        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <CategoryCard
            categoria={{ nombre: 'Todos', icono: '🍽️' }}
            activa={!catActiva}
            disabled={!cajaAbierta}
            cantidad={totalProductos}
            onClick={() => onCatActivaChange(null)}
          />
          {categorias.map((categoria) => (
            <CategoryCard
              key={categoria.id}
              categoria={categoria}
              activa={catActiva === categoria.id}
              disabled={!cajaAbierta}
              cantidad={Number(conteoPorCategoria?.[categoria.id] || 0)}
              onClick={() => onCatActivaChange(categoria.id)}
            />
          ))}
        </div>

        {productosRapidos.length ? (
          <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Rápidos
            </span>
            {productosRapidos.map((producto) => {
              const puedeVender = cajaAbierta && producto.disponible_para_venta !== false;
              return (
                <button
                  key={producto.id}
                  type="button"
                  disabled={!puedeVender}
                  onClick={() => onAddItem(producto)}
                  title={`Agregar ${producto.nombre}`}
                  className="h-8 shrink-0 rounded-lg bg-gray-100 px-3 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {producto.nombre}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {!cajaAbierta ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
            <div className="rounded-2xl bg-white px-8 py-7 text-center shadow-xl">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-500">
                Caja cerrada
              </p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">
                Abrí el turno para vender
              </h3>
              <p className="mt-1.5 text-[13px] text-gray-500">
                Hasta abrir caja, el catálogo queda bloqueado.
              </p>
              <button
                type="button"
                onClick={onGoCaja}
                className="mt-5 h-11 rounded-xl bg-brand-500 px-6 text-[13px] font-semibold text-white transition hover:bg-brand-600"
              >
                Ir a caja
              </button>
            </div>
          </div>
        ) : null}

        {cargando && productosFiltrados.length === 0 ? (
          <CatalogSkeleton />
        ) : (
          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          >
            {productosFiltrados.map((producto, index) => {
              const badge = stockBadge(producto);
              const primaryPrice = getPrimaryDisplayPrice(producto);
              const qtyInCart = Number(cartQtyByProductId[producto.id] || 0);
              const imageUrl = producto?.imagen ? resolveAssetUrl(producto.imagen) : null;
              const puedeVender = cajaAbierta && producto.disponible_para_venta !== false;
              // El stepper sólo aparece si el producto está una única vez en
              // el carrito. Con variantes distintas habría dos líneas y no
              // sabríamos a cuál restarle.
              const stepperInline =
                qtyInCart > 0 && Number(cartLinesByProductId[producto.id] || 0) === 1;

              return (
                <motion.div
                  key={producto.id}
                  ref={(node) => {
                    productRefs.current[index] = node;
                  }}
                  role="button"
                  tabIndex={puedeVender ? 0 : -1}
                  aria-disabled={!puedeVender}
                  whileTap={puedeVender ? { scale: 0.975 } : undefined}
                  onClick={() => puedeVender && onAddItem(producto)}
                  onKeyDown={(event) => {
                    if (puedeVender && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onAddItem(producto);
                    } else if (
                      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                    ) {
                      event.preventDefault();
                      moverProducto(index, event.key);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      searchInputRef?.current?.focus();
                    }
                  }}
                  onFocus={() => setProductoActivoId(producto.id)}
                  style={
                    qtyInCart > 0 || productoActivoId === producto.id
                      ? { boxShadow: `0 0 0 2px ${BRAND}` }
                      : undefined
                  }
                  className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white p-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-shadow duration-200 ${!puedeVender ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:shadow-[0_6px_20px_rgba(15,23,42,0.09)]'}`}
                >
                  <div className="relative mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gray-50">
                    <ProductThumb producto={producto} imageUrl={imageUrl} />

                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 backdrop-blur">
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                      {badge.text}
                    </span>

                    {qtyInCart > 0 ? (
                      <motion.span
                        key={qtyInCart}
                        initial={{ scale: 1.35 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 12, stiffness: 480 }}
                        style={{ background: BRAND }}
                        className="absolute right-1.5 top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white"
                      >
                        {qtyInCart}
                      </motion.span>
                    ) : null}
                  </div>

                  <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-900">
                    {producto.nombre}
                  </p>
                  {primaryPrice.label || producto.descripcion ? (
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-400">
                      {primaryPrice.label || producto.descripcion}
                    </p>
                  ) : null}

                  <p className="mt-1.5 text-[14px] font-bold tabular-nums" style={{ color: BRAND }}>
                    {fmt(primaryPrice.price)}
                  </p>

                  <div className="mt-2 flex items-center gap-1.5">
                    {stepperInline ? (
                      // El producto está una sola vez en el carrito: se puede
                      // ajustar la cantidad sin ir hasta la columna del pedido.
                      <div
                        className="flex h-8 flex-1 items-center justify-between rounded-lg px-1"
                        style={{ background: '#FDE3E4' }}
                        onClick={(event) => event.stopPropagation()}
                        role="presentation"
                      >
                        <button
                          type="button"
                          onClick={() => onRestarItem?.(producto)}
                          aria-label={`Restar uno de ${producto.nombre}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-gray-600 transition active:scale-90"
                        >
                          <Minus size={13} strokeWidth={STROKE} />
                        </button>
                        <span
                          className="text-[13px] font-semibold tabular-nums"
                          style={{ color: BRAND }}
                        >
                          {qtyInCart}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAddItem(producto)}
                          aria-label={`Sumar uno de ${producto.nombre}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-gray-600 transition active:scale-90"
                        >
                          <Plus size={13} strokeWidth={STROKE} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${puedeVender ? 'bg-gray-100 text-gray-600 group-hover:bg-gray-900 group-hover:text-white' : 'bg-gray-100 text-gray-300'}`}
                      >
                        <Plus size={13} strokeWidth={STROKE} />
                        Agregar
                      </div>
                    )}

                    {puedeVender ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddItemWithOptions?.(producto);
                        }}
                        title="Agregar con extras o nota"
                        aria-label="Agregar con extras o nota"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                      >
                        <ListPlus size={14} strokeWidth={STROKE} />
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {!cargando && productosFiltrados.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
              <Search size={26} strokeWidth={1.5} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No hay productos con ese filtro</p>
            <button
              type="button"
              onClick={() => {
                onBusquedaChange('');
                onCatActivaChange(null);
              }}
              className="mt-4 h-10 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200"
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
          className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-3 rounded-full bg-brand-500 px-5 text-white shadow-xl transition active:scale-95 lg:hidden"
        >
          <div className="relative">
            <ShoppingCart size={20} strokeWidth={STROKE} />
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold tabular-nums text-brand-600">
              {totalItems}
            </span>
          </div>
          <span className="text-sm font-semibold tabular-nums">{fmt(total)}</span>
        </button>
      ) : null}
    </section>
  );
}
