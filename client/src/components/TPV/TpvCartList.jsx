import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';

import { resolveAssetUrl } from '../../lib/assets.js';
import { fmt, STROKE } from './tpvUi.jsx';

function ItemThumb({ item }) {
  const [broken, setBroken] = useState(false);
  const url = item?.imagen ? resolveAssetUrl(item.imagen) : null;

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="h-11 w-11 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100">
      {item?.categoria_icono ? (
        <span className="text-lg opacity-50">{item.categoria_icono}</span>
      ) : (
        <UtensilsCrossed size={18} strokeWidth={1.6} className="text-gray-300" />
      )}
    </div>
  );
}

/**
 * Lista de items del pedido.
 *
 * La miniatura no es decoración: confirma de un vistazo que se cargó el
 * producto correcto sin tener que leer el nombre. Es lo que hacen todos
 * los TPV buenos y es especialmente útil cuando hay varios productos con
 * nombres parecidos.
 *
 * El botón de menos se convierte en tacho cuando queda una sola unidad,
 * así borrar un item es un solo toque en vez de dos controles distintos.
 */
export default function TpvCartList({
  items,
  lastAddedId,
  listRef,
  onCambiarCantidad,
  onQuitarItem,
}) {
  return (
    <div ref={listRef} className="no-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3">
      {items.length === 0 ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-4 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
            <ShoppingBag size={22} strokeWidth={1.6} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">El pedido está vacío</p>
          <p className="mt-1 text-xs text-gray-300">Tocá un producto para empezar</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={`flex items-center gap-3 rounded-2xl p-2 transition-colors ${lastAddedId === item.id ? 'bg-brand-50' : 'bg-white'}`}
            >
              <ItemThumb item={item} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight text-gray-900">
                  {item.nombre}
                </p>
                {item.descripcion ? (
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400">
                    {item.descripcion}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[13px] font-bold tabular-nums text-brand-600">
                  {fmt(item.precio_unitario * item.cantidad)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    item.cantidad <= 1 ? onQuitarItem(item.id) : onCambiarCantidad(item.id, -1)
                  }
                  aria-label={item.cantidad <= 1 ? 'Quitar del pedido' : 'Restar uno'}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-gray-300 hover:text-gray-800 active:scale-90"
                >
                  {item.cantidad <= 1 ? (
                    <Trash2 size={13} strokeWidth={STROKE} />
                  ) : (
                    <Minus size={13} strokeWidth={STROKE} />
                  )}
                </button>
                <span className="min-w-[18px] text-center text-[13px] font-semibold tabular-nums text-gray-900">
                  {item.cantidad}
                </span>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(item.id, 1)}
                  aria-label="Sumar uno"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-gray-300 hover:text-gray-800 active:scale-90"
                >
                  <Plus size={13} strokeWidth={STROKE} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
