import { ShoppingCart } from 'lucide-react';

export default function FloatingCart({
  totalItems,
  total,
  fmt,
  colorPrimario,
  theme,
  cartHighlightItems,
  carrito,
  onOpenCart,
}) {
  return (
    <>
      {/* Mobile */}
      {totalItems > 0 && (
        <button
          onClick={onOpenCart}
          className="fixed bottom-4 left-4 right-4 z-[120] flex h-14 items-center justify-between rounded-2xl px-5 text-white shadow-2xl md:hidden"
          style={{
            background: `linear-gradient(135deg, ${colorPrimario} 0%, ${theme?.primaryStrong || colorPrimario} 100%)`,
          }}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart size={18} />
            {totalItems} item{totalItems === 1 ? '' : 's'}
          </span>
          <span className="text-lg font-bold">{fmt(total)}</span>
        </button>
      )}

      {/* Desktop */}
      {totalItems > 0 && (
        <button
          onClick={onOpenCart}
          className="fixed bottom-6 right-6 z-[118] hidden w-[340px] overflow-hidden rounded-[24px] border bg-white text-left shadow-2xl transition-all hover:-translate-y-0.5 lg:block"
          style={{ borderColor: theme?.border || '#f1dfd7' }}
        >
          <div className="border-b px-5 py-4" style={{ borderColor: theme?.border || '#f1dfd7' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p
                  className="text-xs font-black uppercase tracking-[0.18em]"
                  style={{ color: colorPrimario }}
                >
                  Tu pedido
                </p>
                <p className="mt-1 text-lg font-black text-gray-900">
                  {totalItems} item{totalItems === 1 ? '' : 's'} cargados
                </p>
              </div>
              <div
                className="rounded-xl px-3 py-2 text-sm font-black text-white"
                style={{
                  background: `linear-gradient(135deg, ${colorPrimario} 0%, ${theme?.primaryStrong || colorPrimario} 100%)`,
                }}
              >
                {fmt(total)}
              </div>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            {cartHighlightItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                  <p className="mt-1 text-xs font-medium text-gray-400">
                    {item.cantidad} x {fmt(item.precio_unitario)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-gray-900">
                  {fmt(item.cantidad * item.precio_unitario)}
                </span>
              </div>
            ))}
            {carrito.length > 3 ? (
              <p className="text-xs font-medium text-gray-400">
                Y {carrito.length - 3} producto{carrito.length - 3 === 1 ? '' : 's'} más
              </p>
            ) : null}
          </div>
          <div
            className="flex items-center justify-between border-t bg-[#fff4ec] px-5 py-3 text-gray-900"
            style={{ borderColor: theme?.border || '#f1dfd7' }}
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">
              Abrir pedido
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </button>
      )}
    </>
  );
}
