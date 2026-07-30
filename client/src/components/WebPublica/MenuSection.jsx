import { Search, X, ShoppingBag, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
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
      {browseAll && menuDelDiaItems.length > 0 && (
        <section
          className="mb-12 overflow-hidden rounded-[30px] border text-gray-900 shadow-[0_24px_56px_rgba(20,20,20,0.08)] backdrop-blur-sm"
          style={{
            backgroundColor: theme?.panel || 'rgba(255,255,255,0.92)',
            borderColor: theme?.border || '#f1dfd7',
          }}
        >
          <div className="grid gap-0 lg:grid-cols-[0.95fr,1.05fr]">
            <div className="p-8 md:p-10">
              <p
                className="text-xs font-black uppercase tracking-[0.22em]"
                style={{ color: colorPrimario }}
              >
                Hoy se mueve fuerte
              </p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">Menú del día</h2>
              <p className="mt-4 max-w-xl text-base text-gray-600 leading-relaxed font-medium">
                Una sección bien visible para resolver rápido el almuerzo o la cena. Todos los
                platos cargados hoy salen desde {fmt(menuDelDiaItems[0]?.precio || 0)} y podés
                pedirlos igual que cualquier otro producto.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={() => {
                    setCatActiva(menuDelDiaCategoria?.id || null);
                    setBusqueda('');
                    document
                      .getElementById('menu-publico')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-black text-white shadow-lg transition active:scale-95 hover:brightness-110"
                  style={{ backgroundColor: colorPrimario }}
                >
                  Ver menú del día
                  <ArrowUpRight size={18} />
                </button>
                <div
                  className="inline-flex h-12 items-center rounded-xl border bg-white px-5 text-base font-bold text-gray-600 shadow-sm"
                  style={{ borderColor: theme?.border || '#f1dfd7' }}
                >
                  {menuDelDiaItems.length} opciones activas
                </div>
              </div>
            </div>
            <div className="grid gap-3 bg-[#fff4ec] p-5 md:grid-cols-2">
              {menuDelDiaItems.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onVerDetalle(item)}
                  className="rounded-2xl border bg-white p-5 text-left transition hover:-translate-y-1 hover:shadow-lg"
                  style={{ borderColor: theme?.border || '#f1dfd7' }}
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">
                    Listo para pedir
                  </p>
                  <h3 className="mt-2 text-lg font-black leading-tight">{item.nombre}</h3>
                  <p className="mt-2 text-base font-bold" style={{ color: colorPrimario }}>
                    {fmt(item.precio)}
                  </p>
                  {item.descripcion ? (
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.descripcion}</p>
                  ) : null}
                </button>
              ))}
            </div>
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-28 text-center">
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
        </motion.div>
      )}
    </main>
  );
}
