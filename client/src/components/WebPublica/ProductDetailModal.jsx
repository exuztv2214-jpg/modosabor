import { X, Share2, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { fmt, getVariantHint } from '../../lib/webPublicaHelpers.js';
import { buildPublicAppUrl } from '../../lib/publicUrls.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import {
  getPrimaryDisplayPrice,
  getStructuredDisplayPrices,
  safeParseArray,
} from '../../lib/pedidoForm.js';

export default function ProductDetailModal({
  producto,
  colorPrimario,
  theme,
  config,
  onClose,
  onAdd,
}) {
  if (!producto) return null;

  const tieneVariantes =
    safeParseArray(producto.variantes).length > 0 || safeParseArray(producto.extras).length > 0;
  const imageUrl = producto?.imagen ? resolveAssetUrl(producto.imagen) : null;

  return (
    <AnimatePresence>
      {producto && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white/95 shadow-2xl backdrop-blur-xl sm:rounded-[28px]"
            style={{ maxHeight: '90vh' }}
          >
            <div className="relative shrink-0 bg-gray-100" style={{ aspectRatio: '16/9' }}>
              {imageUrl ? (
                <img src={imageUrl} alt={producto.nombre} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#ffe3d1] to-[#fffaf6]">
                  {producto?.categoria_icono ? (
                    <span className="text-5xl leading-none opacity-80">
                      {producto.categoria_icono}
                    </span>
                  ) : (
                    <UtensilsCrossed size={40} className="text-gray-400" strokeWidth={1.75} />
                  )}
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500/70">
                    {producto?.categoria_nombre || 'Sin foto'}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <button
                  onClick={async () => {
                    const url = `${buildPublicAppUrl(window.location.pathname, config)}#producto-${producto.id}`;
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: producto.nombre,
                          text: producto.descripcion || producto.nombre,
                          url,
                        });
                      } catch {
                        // noop
                      }
                    } else {
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success('Link copiado');
                      } catch {
                        // noop
                      }
                    }
                  }}
                  aria-label="Compartir producto"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-gray-700 shadow-sm backdrop-blur"
                >
                  <Share2 size={18} />
                </button>
                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-gray-700 shadow-sm backdrop-blur"
                >
                  <X size={20} />
                </button>
              </div>
              {producto.destacado === 1 && (
                <div
                  className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: colorPrimario }}
                >
                  Recomendado
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {producto.categoria_nombre && (
                <p
                  className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.22em]"
                  style={{ color: colorPrimario }}
                >
                  {producto.categoria_nombre}
                  {String(producto.categoria_nombre).trim().toLowerCase() === 'menu del dia' && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] tracking-[0.1em]"
                      style={{ backgroundColor: theme?.accentSoft || '#fff2d9', color: '#9a5b05' }}
                    >
                      {producto.menu_dia_tipo === 'ejecutivo' ? 'Ejecutivo' : 'Económico'}
                    </span>
                  )}
                </p>
              )}
              <h3 className="mb-3 text-3xl font-black text-gray-900 leading-tight">
                {producto.nombre}
              </h3>
              {producto.descripcion && (
                <p className="mb-6 text-sm font-medium leading-relaxed text-gray-500">
                  {producto.descripcion}
                </p>
              )}
              {getStructuredDisplayPrices(producto).items.length > 0 && (
                <div className="mb-6 grid grid-cols-2 gap-3">
                  {getStructuredDisplayPrices(producto).items.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border px-4 py-3"
                      style={{
                        backgroundColor: theme?.surface || '#fff8f4',
                        borderColor: theme?.border || '#f1dfd7',
                      }}
                    >
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                        {item.label}
                      </p>
                      <p className="mt-1 text-lg font-bold" style={{ color: colorPrimario }}>
                        {fmt(item.price)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {getVariantHint(producto) ? (
                <div
                  className="mb-6 rounded-2xl border px-4 py-3"
                  style={{
                    backgroundColor: theme?.accentSoft || '#fff2d9',
                    borderColor: '#f4d8a2',
                  }}
                >
                  <p className="text-[10px] font-black text-[#9a5b05] uppercase tracking-wide">
                    Antes de agregar
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#8a4b00]">
                    {getVariantHint(producto)}
                  </p>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-gray-100 pt-5">
                <div>
                  <span className="text-2xl font-bold" style={{ color: colorPrimario }}>
                    {fmt(getPrimaryDisplayPrice(producto).price)}
                  </span>
                  {getPrimaryDisplayPrice(producto).label ? (
                    <p className="mt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                      {getPrimaryDisplayPrice(producto).label}
                    </p>
                  ) : null}
                </div>
                {producto.disponible_para_venta !== false ? (
                  <button
                    onClick={() => {
                      onAdd(producto);
                      onClose();
                    }}
                    className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-lg transition active:scale-95"
                    style={{ backgroundColor: colorPrimario }}
                  >
                    {tieneVariantes ? 'Elegir opciones' : 'Agregar al pedido'}
                  </button>
                ) : (
                  <span className="text-sm font-semibold text-gray-400">Sin stock</span>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
