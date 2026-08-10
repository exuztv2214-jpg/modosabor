import { useMemo } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmt, getVariantSelectionPrice } from '../../lib/webPublicaHelpers.js';
import { getStructuredDisplayPrices } from '../../lib/pedidoForm.js';
import { variantesCompletas as esCompleto } from '../../lib/variantesObligatorias.js';

export default function VariantModal({ modal, setModal, colorPrimario, onClose, onAddToCart }) {
  const variantesCompletas = useMemo(
    () => !modal || esCompleto(modal.variantes, modal.sel),
    [modal]
  );

  if (!modal) return null;

  return (
    <AnimatePresence>
      {modal && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center p-4 sm:items-center">
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
            className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white/95 shadow-2xl backdrop-blur-xl sm:rounded-2xl"
            style={{ maxHeight: '80vh' }}
          >
            <div className="flex shrink-0 items-center justify-between p-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{modal.producto.nombre}</h3>
                <p className="mt-1 text-xs font-semibold" style={{ color: colorPrimario }}>
                  Total seleccionado{' '}
                  {fmt(getVariantSelectionPrice(modal.producto, modal.sel, modal.extrasSel))}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {getStructuredDisplayPrices(modal.producto).items.length > 0 && (
              <div className="mb-4 shrink-0 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 mx-6">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Precios base
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {getStructuredDisplayPrices(modal.producto).items.map((item) => (
                    <div key={item.label} className="rounded-xl bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        {item.label}
                      </p>
                      <p className="mt-1 text-lg font-bold" style={{ color: colorPrimario }}>
                        {fmt(item.price)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-y-auto space-y-6 px-6 pb-6">
              {modal.variantes.map((v) => (
                <div key={v.nombre} className="space-y-3">
                  <label className="text-xs font-semibold text-gray-500">
                    {v.nombre} <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {v.opciones.map((o) => {
                      const oNombre = o.nombre || o;
                      const selected = modal.sel[v.nombre]?.nombre === oNombre;
                      const finalPrice =
                        Number(modal.producto?.precio || 0) + Number(o?.precio_extra || 0);
                      return (
                        <button
                          key={oNombre}
                          onClick={() =>
                            setModal((prev) => ({
                              ...prev,
                              sel: {
                                ...prev.sel,
                                [v.nombre]: typeof o === 'string' ? { nombre: o } : o,
                              },
                            }))
                          }
                          className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-3 transition-all ${selected ? 'shadow-md' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                          style={
                            selected
                              ? {
                                  borderColor: colorPrimario,
                                  backgroundColor: `${colorPrimario}12`,
                                  color: colorPrimario,
                                }
                              : {}
                          }
                        >
                          <span className="text-xs font-semibold">{oNombre}</span>
                          <span className={`text-sm font-bold ${selected ? '' : 'text-gray-900'}`}>
                            {fmt(finalPrice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {modal.extras.length > 0 && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-gray-500">
                    Extras <span className="font-normal text-gray-300">(opcional)</span>
                  </label>
                  <div className="space-y-2">
                    {modal.extras.map((extra) => {
                      const extraNombre = extra.nombre || extra;
                      const extraPrecio = Number(extra.precio || 0);
                      const isSelected = modal.extrasSel.some(
                        (e) => (e.nombre || e) === extraNombre
                      );
                      return (
                        <button
                          key={extraNombre}
                          onClick={() =>
                            setModal((prev) => ({
                              ...prev,
                              extrasSel: isSelected
                                ? prev.extrasSel.filter((e) => (e.nombre || e) !== extraNombre)
                                : [
                                    ...prev.extrasSel,
                                    typeof extra === 'string'
                                      ? { nombre: extra, precio: 0 }
                                      : extra,
                                  ],
                            }))
                          }
                          className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 transition-all ${isSelected ? 'shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                          style={
                            isSelected
                              ? {
                                  borderColor: colorPrimario,
                                  backgroundColor: `${colorPrimario}12`,
                                }
                              : {}
                          }
                        >
                          <span className="text-sm font-semibold text-gray-900">{extraNombre}</span>
                          <span className="text-sm font-bold" style={{ color: colorPrimario }}>
                            {extraPrecio > 0 ? `+${fmt(extraPrecio)}` : 'Gratis'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500">
                  Nota <span className="font-normal text-gray-300">(opcional)</span>
                </label>
                <textarea
                  value={modal.notas || ''}
                  onChange={(event) => setModal((prev) => ({ ...prev, notas: event.target.value }))}
                  placeholder="Ej: sin aceituna, bien cocida, sin picante..."
                  rows={2}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none transition focus:border-gray-300"
                />
              </div>
            </div>

            {!variantesCompletas ? (
              <p className="mt-2 shrink-0 px-6 text-center text-xs font-semibold text-amber-500">
                Elegí una opción para continuar
              </p>
            ) : null}
            <button
              onClick={() => onAddToCart(modal.producto, modal.sel, modal.extrasSel, modal.notas)}
              disabled={!variantesCompletas}
              className={`mt-4 shrink-0 mx-6 mb-6 h-12 rounded-xl text-sm font-semibold shadow-lg transition-all active:scale-95 ${
                variantesCompletas
                  ? 'text-white'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400 shadow-none'
              }`}
              style={variantesCompletas ? { backgroundColor: colorPrimario } : {}}
            >
              Agregar al pedido
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
