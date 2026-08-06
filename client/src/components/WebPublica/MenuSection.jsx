import { Search, X, ShoppingBag, ArrowUpRight, Plus } from 'lucide-react';
import { fmt, isVisibleOnPublicMenu, getCategoryDescription } from '../../lib/webPublicaHelpers.js';
import ProductoCard from './ProductoCard.jsx';

export default function MenuSection({
  browseAll,
  menuDelDiaItems,
  menuDelDiaCategoria,
  busqueda,
  setBusqueda,
  setCatActiva,
  catActiva,
  categorias,
  productosFiltrados,
  destacados,
  homeSections,
  productos,
  isEnabled,
  config,
  colorPrimario,
  theme,
  cantidadesEnCarrito,
  onAgregar,
  onVerDetalle,
  onIncrementar,
  onDecrementar,
  pedidoMinimo,
  tiempoEstimado,
  tipoEntrega,
  faltaParaMinimo,
  activeQuickFilter,
  quickFilter,
}) {
  const totalDisponibles = productos.filter(isVisibleOnPublicMenu).length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-28 md:px-8">
      {/*
        ── El menú del día es la portada real ────────────────────────────────

        El negocio son los platos de hoy: cambian cada día y es lo único que
        alguien quiere saber al mediodía. Antes esta sección era un bloque de
        marketing que hablaba *sobre* la sección ("Una sección bien visible
        para resolver rápido...") en vez de mostrar la comida, con las tarjetas
        apretadas en una columna lateral y sin poder pedir desde ahí.

        Ahora: la fecha bien visible —que es lo que le da valor a "del día"—,
        los platos en tarjetas grandes y el botón de agregar en cada uno. El
        camino de ver el plato a tenerlo en el carrito es un toque.
      */}
      {browseAll && menuDelDiaItems.length > 0 && (
        <section className="-mt-2 mb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold capitalize" style={{ color: colorPrimario }}>
                {new Date().toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <h2 className="mt-0.5 text-[26px] font-bold leading-tight text-gray-900 md:text-3xl">
                Menú de hoy
              </h2>
            </div>
            <button
              onClick={() => {
                setCatActiva(menuDelDiaCategoria?.id || null);
                setBusqueda('');
                document
                  .getElementById('menu-publico')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-medium transition hover:bg-gray-100"
              style={{ color: colorPrimario }}
            >
              Ver todo
              <ArrowUpRight size={16} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {menuDelDiaItems.slice(0, 6).map((item) => (
              <article
                key={item.id}
                className="flex flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_3px_rgba(20,20,20,0.06)] transition hover:shadow-md"
                style={{ borderColor: theme?.border || '#f1dfd7' }}
              >
                <button
                  onClick={() => onVerDetalle(item)}
                  className="flex-1 text-left"
                  aria-label={`Ver ${item.nombre}`}
                >
                  <h3 className="text-[17px] font-semibold leading-snug text-gray-900">
                    {item.nombre}
                  </h3>
                  {item.descripcion ? (
                    <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-gray-600">
                      {item.descripcion}
                    </p>
                  ) : null}
                </button>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-[20px] font-bold" style={{ color: colorPrimario }}>
                    {fmt(item.precio)}
                  </span>
                  <button
                    onClick={() => onAgregar(item)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold text-white transition active:scale-95 hover:brightness-110"
                    style={{ backgroundColor: colorPrimario }}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    Agregar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="relative mb-10 mt-4 max-w-xl">
        <Search
          size={18}
          className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setCatActiva(null);
          }}
          placeholder="Buscar producto..."
          className="h-14 w-full rounded-2xl border bg-white pl-12 pr-5 text-base font-medium shadow-sm outline-none focus:ring-2"
          style={{
            borderColor: theme?.border || '#f1dfd7',
            '--tw-ring-color': `${colorPrimario}40`,
          }}
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div
        className="mb-10 flex flex-col gap-4 rounded-[26px] border bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between"
        style={{ borderColor: theme?.border || '#f1dfd7' }}
      >
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.22em]"
            style={{ color: colorPrimario }}
          >
            Explorar carta
          </p>
          <p className="mt-1.5 text-base font-medium text-gray-500">
            {busqueda
              ? `${productosFiltrados.length} resultado${productosFiltrados.length === 1 ? '' : 's'} para "${busqueda}"`
              : catActiva
                ? `${productosFiltrados.length} opciones en ${categorias.find((cat) => cat.id === catActiva)?.nombre || 'esta categoría'}`
                : quickFilter !== 'all'
                  ? `${activeQuickFilter.count} opciones en ${activeQuickFilter.label.toLowerCase()}`
                  : `${totalDisponibles} productos disponibles ahora`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold text-gray-400">
          {pedidoMinimo > 0 && (
            <span className="rounded-full bg-gray-50 px-4 py-2">Mínimo {fmt(pedidoMinimo)}</span>
          )}
          <span className="rounded-full bg-gray-50 px-4 py-2">
            {tipoEntrega === 'retiro'
              ? `Retiro ~${tiempoEstimado} min`
              : `Entrega ~${tiempoEstimado} min`}
          </span>
          {faltaParaMinimo > 0 && tipoEntrega === 'delivery' ? (
            <span className="rounded-full bg-amber-50 px-4 py-2 text-amber-700">
              Faltan {fmt(faltaParaMinimo)}
            </span>
          ) : null}
        </div>
      </div>

      {isEnabled(config.web_mostrar_destacados) &&
        destacados.length > 0 &&
        !catActiva &&
        !busqueda && (
          <section className="mb-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide" style={{ color: colorPrimario }}>
                  Recomendados
                </p>
                <h2 className="mt-2 text-3xl font-black text-gray-900">Los más pedidos</h2>
              </div>
              <button
                onClick={() => {
                  setCatActiva(null);
                  setBusqueda('');
                }}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 transition"
              >
                Ver carta
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {destacados.map((p) => (
                <ProductoCard
                  key={`dest-${p.id}`}
                  producto={p}
                  onAgregar={onAgregar}
                  colorPrimario={colorPrimario}
                  theme={theme}
                  cantidadSimple={cantidadesEnCarrito[p.id] || 0}
                  onIncrementar={onIncrementar}
                  onDecrementar={onDecrementar}
                  onVerDetalle={onVerDetalle}
                />
              ))}
            </div>
          </section>
        )}

      {!browseAll && (
        <>
          <div className="mb-6">
            <p
              className="text-xs font-black uppercase tracking-[0.22em]"
              style={{ color: colorPrimario }}
            >
              Carta online
            </p>
            <h2 className="mt-2 text-3xl font-black text-gray-900">
              {catActiva
                ? categorias.find((cat) => cat.id === catActiva)?.nombre || 'Menú'
                : 'Todo el menú'}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 mt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {productosFiltrados.map((p) => (
              <ProductoCard
                key={p.id}
                producto={p}
                onAgregar={onAgregar}
                colorPrimario={colorPrimario}
                theme={theme}
                cantidadSimple={cantidadesEnCarrito[p.id] || 0}
                onIncrementar={onIncrementar}
                onDecrementar={onDecrementar}
                onVerDetalle={onVerDetalle}
              />
            ))}
          </div>
        </>
      )}

      {browseAll && (
        <div className="space-y-16">
          {homeSections.map((categoria) => (
            <section key={categoria.id}>
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p
                    className="text-xs font-black uppercase tracking-[0.22em]"
                    style={{ color: colorPrimario }}
                  >
                    {categoria.icono ? `${categoria.icono} ` : ''}
                    {categoria.productos.length} opciones
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-gray-900">{categoria.nombre}</h2>
                  <p className="mt-3 max-w-2xl text-base text-gray-500 leading-relaxed font-medium">
                    {getCategoryDescription(categoria.nombre)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCatActiva(categoria.id);
                    setBusqueda('');
                    document
                      .getElementById('menu-publico')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border bg-white px-5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow-md"
                  style={{ borderColor: theme?.border || '#f1dfd7' }}
                >
                  Ver solo {categoria.nombre}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {categoria.productos.map((p) => (
                  <ProductoCard
                    key={p.id}
                    producto={p}
                    onAgregar={onAgregar}
                    colorPrimario={colorPrimario}
                    theme={theme}
                    cantidadSimple={cantidadesEnCarrito[p.id] || 0}
                    onIncrementar={onIncrementar}
                    onDecrementar={onDecrementar}
                    onVerDetalle={onVerDetalle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {productosFiltrados.length === 0 && !browseAll && (
        <div className="ms-fundido py-28 text-center">
          <div className="h-24 w-28 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-gray-300">
            {busqueda ? (
              <Search size={48} strokeWidth={1.5} />
            ) : (
              <ShoppingBag size={48} strokeWidth={1.5} />
            )}
          </div>
          {busqueda ? (
            <>
              <p className="text-xl font-bold text-gray-400">No encontramos "{busqueda}"</p>
              <button
                onClick={() => setBusqueda('')}
                className="mt-4 text-sm font-bold hover:underline"
                style={{ color: colorPrimario }}
              >
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <p className="text-xl font-bold text-gray-400">Sin productos en esta categoría</p>
          )}
        </div>
      )}
    </main>
  );
}
