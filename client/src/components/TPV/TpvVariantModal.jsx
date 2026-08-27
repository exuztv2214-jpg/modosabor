import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

import { faltaElegirGrupo, grupoEsObligatorio } from '../../lib/variantesObligatorias.js';
import { BRAND, fmt, STROKE } from './tpvUi.jsx';

/**
 * Modal de armado de producto.
 *
 * Venía del template original y era el último rincón del TPV que seguía
 * hablando otro idioma: violeta `primary-*` (que es el azul del template,
 * no el rojo de la marca), `font-black` en todo, y fondos naranjas
 * combinados con bordes azules.
 *
 * Tres cosas cambian más allá del color:
 *
 *  1. **Cabecera y pie fijos.** Una pizza con tamaño, masa, mitad y ocho
 *     extras no entra en pantalla: antes el total y el botón de agregar
 *     quedaban abajo de todo y había que scrollear para cobrar. Ahora el
 *     precio siempre está a la vista.
 *
 *  2. **El botón dice qué falta.** El cartel ámbar "Completa todas las
 *     variantes obligatorias" no decía *cuál*. Con dos o tres grupos el
 *     operador tenía que revisarlos de a uno. Ahora el botón mismo dice
 *     "Elegí Tamaño" y el grupo pendiente queda marcado.
 *
 *  3. **La selección se ve.** Un borde de color no alcanza en un monitor
 *     de mostrador con reflejo: va tilde sobre fondo rojo, que se
 *     distingue de reojo y a un metro de distancia.
 */
export default function TpvVariantModal({
  onAddToCart,
  onClose,
  onToggleExtra,
  onSelectVariant,
  notas,
  onNotasChange,
  selectedVariantTotal,
  variantesCompletas,
  variantModal,
}) {
  const agregarButtonRef = useRef(null);

  // Escape cierra. Es el reflejo de cualquiera que cancele un producto mal
  // elegido, y hasta ahora sólo funcionaba el click afuera.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const precioBase =
    variantModal.rewardOptions?.priceOverride !== undefined
      ? Number(variantModal.rewardOptions.priceOverride || 0)
      : Number(variantModal.producto.precio || 0);

  /*
    El primer grupo obligatorio sin elegir es el que nombra el botón.

    Tiene que mirar sólo los obligatorios: un grupo opcional sin elegir —una
    salsa que el cliente no quiso— dejaría el botón diciendo "Elegí Salsas"
    para siempre, al lado de un botón que sí funciona.
  */
  const grupoPendiente = useMemo(
    () => faltaElegirGrupo(variantModal.variantes, variantModal.sel)?.nombre || null,
    [variantModal.variantes, variantModal.sel]
  );

  useEffect(() => {
    if (variantesCompletas) agregarButtonRef.current?.focus();
  }, [variantesCompletas]);

  const total =
    selectedVariantTotal ??
    variantModal.rewardOptions?.priceOverride ??
    variantModal.producto.precio;

  const optionFinalPrice = (groupName, option) => {
    const otherVariants = Object.entries(variantModal.sel || {}).reduce(
      (sum, [name, selected]) =>
        name === groupName ? sum : sum + Number(selected?.precio_extra || 0),
      0
    );
    const selectedExtras = (variantModal.extrasSel || []).reduce(
      (sum, extra) => sum + Number(extra?.precio || 0),
      0
    );
    return precioBase + otherVariants + Number(option?.precio_extra || 0) + selectedExtras;
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Armar ${variantModal.producto.nombre}`}
        className="flex max-h-[88vh] w-full max-w-[460px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* ── Cabecera ── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold leading-tight text-gray-900">
              {variantModal.producto.nombre}
            </h3>
            {variantModal.rewardOptions ? (
              <span className="mt-1.5 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                Premio de fidelidad
              </span>
            ) : (
              <p className="mt-0.5 text-[13px] text-gray-400">Selección actual {fmt(total)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        {/* ── Cuerpo ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {variantModal.variantes.map((group) => {
            const pendiente = group.nombre === grupoPendiente;
            return (
              <div key={group.nombre} className="mb-6 last:mb-0">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold text-gray-900">{group.nombre}</p>
                  {pendiente ? (
                    <span className="text-[11px] font-semibold" style={{ color: BRAND }}>
                      Elegí una
                    </span>
                  ) : grupoEsObligatorio(group) ? null : (
                    // Sin esto, un grupo opcional se ve igual que uno que ya
                    // fue elegido, y el cajero no sabe si le falta algo.
                    <span className="text-[11px] font-medium text-gray-400">Opcional</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(group.opciones || []).map((option) => {
                    const optionName = option.nombre || option;
                    const selected = variantModal.sel[group.nombre]?.nombre === optionName;
                    const finalPrice = optionFinalPrice(group.nombre, option);
                    return (
                      <button
                        key={optionName}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onSelectVariant(group.nombre, option)}
                        className={`relative rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-transparent bg-brand-50 ring-2 ring-brand-500'
                            : pendiente
                              ? 'border-brand-200 hover:border-brand-300 hover:bg-brand-50/40'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="block pr-5 text-[13px] font-medium leading-snug text-gray-900">
                          {optionName}
                        </span>
                        <span
                          className={`mt-0.5 block text-[12px] font-bold tabular-nums ${selected ? '' : 'text-gray-500'}`}
                          style={selected ? { color: BRAND } : undefined}
                        >
                          {fmt(finalPrice)}
                        </span>
                        {selected ? (
                          <span
                            className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: BRAND }}
                          >
                            <Check size={11} strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {variantModal.extras.length > 0 ? (
            <div className="mb-6">
              <p className="mb-2.5 text-[13px] font-semibold text-gray-900">
                Extras <span className="font-normal text-gray-400">(opcional)</span>
              </p>
              <div className="space-y-2">
                {variantModal.extras.map((extra) => {
                  const selected = variantModal.extrasSel.some(
                    (item) => item.nombre === extra.nombre
                  );
                  return (
                    <button
                      key={extra.nombre}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onToggleExtra(extra)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-transparent bg-brand-50 ring-2 ring-brand-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors ${selected ? 'border-transparent text-white' : 'border-gray-300 bg-white'}`}
                        style={selected ? { backgroundColor: BRAND } : undefined}
                      >
                        {selected ? <Check size={12} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
                        {extra.nombre}
                      </span>
                      <span
                        className="shrink-0 text-[12px] font-bold tabular-nums"
                        style={{ color: selected ? BRAND : '#6B7280' }}
                      >
                        +{fmt(extra.precio)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-2.5 text-[13px] font-semibold text-gray-900">
              Nota para la cocina <span className="font-normal text-gray-400">(opcional)</span>
            </p>
            <textarea
              value={notas || ''}
              onChange={(event) => onNotasChange?.(event.target.value)}
              placeholder="Sin aceituna, bien cocida, sin picante…"
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
            />
          </div>
        </div>

        {/* ── Pie ── */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] text-gray-500">Total</span>
            <span
              className="text-2xl font-bold tabular-nums tracking-tight"
              style={{ color: BRAND }}
            >
              {fmt(total)}
            </span>
          </div>
          <button
            ref={agregarButtonRef}
            type="button"
            onClick={onAddToCart}
            disabled={!variantesCompletas}
            className={`w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-opacity ${variantesCompletas ? 'hover:opacity-90' : 'cursor-not-allowed'}`}
            style={{ backgroundColor: variantesCompletas ? BRAND : '#CBD5E1' }}
          >
            {variantesCompletas ? 'Agregar al pedido' : `Elegí ${grupoPendiente}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
