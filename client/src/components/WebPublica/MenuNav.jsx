import { ShoppingCart } from 'lucide-react';

export default function MenuNav({
  categoriasVisibles,
  productosPorCategoria,
  catActiva,
  setCatActiva,
  quickFilterOptions,
  quickFilter,
  setQuickFilter,
  setBusqueda,
  totalItems,
  total,
  colorPrimario,
  theme,
  fmt,
  onOpenCart,
}) {
  return (
    <div
      id="menu-publico"
      className="sticky top-[73px] z-[90] border-b px-4 py-4 shadow-sm backdrop-blur-xl md:px-8"
      style={{ backgroundColor: 'rgba(255,250,246,0.92)', borderColor: theme?.border || '#f1dfd7' }}
    >
      <div className="mx-auto max-w-[1400px]">
        {/* Categorías scroll horizontal */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => {
              setCatActiva(null);
              setBusqueda('');
              setQuickFilter('all');
            }}
            className={`shrink-0 h-10 px-5 rounded-lg text-sm font-medium transition-all ${
              !catActiva ? 'text-white shadow-md scale-105' : 'text-gray-700 hover:bg-white border'
            }`}
            style={
              !catActiva
                ? { backgroundColor: colorPrimario }
                : { backgroundColor: 'white', borderColor: theme?.border || '#f1dfd7' }
            }
          >
            Todo
          </button>
          {categoriasVisibles.map((c) => {
            const cnt = productosPorCategoria[c.id] || 0;
            const activa = catActiva === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCatActiva(c.id);
                  setBusqueda('');
                  setQuickFilter('all');
                }}
                className={`shrink-0 h-10 px-5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activa ? 'text-white shadow-md scale-105' : 'text-gray-700 hover:bg-white border'
                }`}
                style={
                  activa
                    ? { backgroundColor: colorPrimario }
                    : { backgroundColor: 'white', borderColor: theme?.border || '#f1dfd7' }
                }
              >
                <span>{c.icono}</span>
                {c.nombre}
                {cnt > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-lg leading-none"
                    style={
                      activa
                        ? { backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }
                        : { backgroundColor: `${colorPrimario}12`, color: colorPrimario }
                    }
                  >
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick filters + botón carrito desktop */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {quickFilterOptions.map((item) => {
            const active = quickFilter === item.id && !catActiva;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCatActiva(null);
                  setBusqueda('');
                  setQuickFilter(item.id);
                }}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-xs font-medium transition-all ${
                  active
                    ? 'text-white shadow-md scale-105'
                    : 'bg-white text-gray-600 hover:border-gray-300'
                }`}
                style={
                  active
                    ? { backgroundColor: colorPrimario, borderColor: colorPrimario }
                    : { borderColor: theme?.border || '#f1dfd7' }
                }
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] ${
                    active ? 'bg-white/20 text-white' : ''
                  }`}
                  style={
                    !active ? { backgroundColor: `${colorPrimario}12`, color: colorPrimario } : {}
                  }
                >
                  {item.count}
                </span>
              </button>
            );
          })}
          <button
            onClick={onOpenCart}
            className="ml-auto hidden h-10 items-center gap-2 rounded-xl border bg-white px-5 text-sm font-bold text-gray-700 shadow-md transition hover:bg-gray-50 md:inline-flex"
            style={{ borderColor: theme?.border || '#f1dfd7' }}
          >
            <ShoppingCart size={16} />
            {totalItems > 0
              ? `${totalItems} item${totalItems === 1 ? '' : 's'} · ${fmt(total)}`
              : 'Ver pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
