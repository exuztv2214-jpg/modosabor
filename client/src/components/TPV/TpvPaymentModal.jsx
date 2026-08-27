import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Delete, X } from 'lucide-react';

import { BRAND, fmt, STROKE } from './tpvUi.jsx';
import { PaymentMark, paymentBrand } from './paymentBrands.jsx';

const SPLIT_METHODS = ['efectivo', 'transferencia', 'mercadopago', 'modo', 'uala'];

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];

/**
 * Modal de cobro.
 *
 * Este es el cambio estructural del rediseño. Antes el método de pago, el
 * efectivo recibido, el vuelto y el reparto del pago mixto vivían dentro
 * de la columna del pedido, y por eso la columna necesitaba ser ancha y
 * los controles terminaban chicos igual.
 *
 * Sacándolo a un modal la columna puede ser angosta (320px) y dedicarse
 * solo a lo que es: el pedido. Y el cobro, que es el momento en que el
 * operador necesita más espacio y menos distracciones, se lleva la
 * pantalla entera.
 *
 * El teclado numérico existe porque para efectivo es más rápido que
 * tipear, y porque el botón "Exacto" resuelve el caso más común de todos
 * de un solo toque.
 */
export default function TpvPaymentModal({
  open,
  onClose,
  total,
  subtotal,
  envio,
  descuentoAplicado,
  descuentoDePuntos,
  canje,
  puntosACanjear,
  onPuntosChange,
  deliveryQuote,
  pagos,
  metodoPago,
  onMetodoPagoChange,
  efectivoRecibido,
  onEfectivoRecibidoChange,
  vuelto,
  splitPayments,
  splitRemaining,
  splitCashTarget,
  onSplitPaymentChange,
  confirmDisabled,
  blockedReason,
  loading,
  onConfirm,
}) {
  const [imprimir, setImprimir] = useState(false);
  const confirmarButtonRef = useRef(null);

  // Al abrir el modal arrancamos siempre sin importe cargado: si quedara
  // el de la venta anterior, un Enter distraído cobraría cualquier cosa.
  useEffect(() => {
    if (open) setImprimir(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Enter' || event.repeat || confirmDisabled || loading) return;
      if (event.target?.closest?.('button')) return;

      event.preventDefault();
      onConfirm(imprimir);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmDisabled, imprimir, loading, onClose, onConfirm, open]);

  useEffect(() => {
    if (open && !confirmDisabled && !loading) confirmarButtonRef.current?.focus();
  }, [confirmDisabled, loading, open]);

  const esEfectivo = metodoPago === 'efectivo';
  const esMixto = metodoPago === 'mixto';
  const objetivoEfectivo = esMixto ? splitCashTarget : total;
  const mostrarTeclado = esEfectivo || (esMixto && splitCashTarget > 0);
  const splitCompleto = Math.abs(splitRemaining) <= 0.5;

  const recibido = String(efectivoRecibido || '');

  const rapidos = useMemo(() => {
    // Sugerencias de billetes: el importe exacto y los redondeos hacia
    // arriba más probables. Con eso se cubre casi todo el mostrador sin
    // tener que tipear.
    const base = Math.max(0, Number(objetivoEfectivo) || 0);
    if (base <= 0) return [];
    const candidatos = new Set();
    [1000, 2000, 5000, 10000, 20000].forEach((paso) => {
      const redondeado = Math.ceil(base / paso) * paso;
      if (redondeado > base) candidatos.add(redondeado);
    });
    return Array.from(candidatos)
      .sort((a, b) => a - b)
      .slice(0, 3);
  }, [objetivoEfectivo]);

  const tecla = (valor) => {
    if (valor === 'back') {
      onEfectivoRecibidoChange(recibido.slice(0, -1));
      return;
    }
    onEfectivoRecibidoChange(`${recibido}${valor}`.replace(/^0+(?=\d)/, ''));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-label="Cobrar pedido"
        className="flex max-h-full w-full max-w-[860px] overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {/* ── Resumen ── */}
        <div className="flex w-[300px] shrink-0 flex-col justify-between bg-gray-50 p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Cobrar
            </p>
            <p className="mt-2 text-5xl font-bold leading-none tabular-nums tracking-tight text-gray-900">
              {fmt(total)}
            </p>

            <div className="mt-6 space-y-2 border-t border-gray-200 pt-4 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{fmt(subtotal)}</span>
              </div>
              {envio > 0 ? (
                <div className="flex justify-between text-gray-500">
                  <span>
                    Envío {deliveryQuote?.zone_name ? `· ${deliveryQuote.zone_name}` : ''}
                  </span>
                  <span className="tabular-nums">{fmt(envio)}</span>
                </div>
              ) : null}
              {descuentoAplicado > 0 ? (
                <div className="flex justify-between font-medium text-brand-600">
                  <span>Descuento</span>
                  <span className="tabular-nums">-{fmt(descuentoAplicado)}</span>
                </div>
              ) : null}
              {descuentoDePuntos > 0 ? (
                <div className="flex justify-between font-medium text-brand-600">
                  <span>Puntos ({puntosACanjear})</span>
                  <span className="tabular-nums">-{fmt(descuentoDePuntos)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/*
            ── Puntos del cliente ──────────────────────────────────────────

            Sólo aparece si hay un cliente elegido y le alcanza para canjear.
            Antes los puntos se acumulaban y nunca se usaban: había que entrar
            a la ficha del cliente, en otra pantalla, mientras el cliente
            esperaba en el mostrador. Nadie lo hacía.

            El botón usa todos los puntos que se puedan, que es lo que la gente
            pide el 95% de las veces. Para usar menos está el campo al lado.
          */}
          {canje ? (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">
                    Tiene {canje.saldo} puntos
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Valen {fmt(canje.valor_saldo)} en total
                  </p>
                </div>
                {puntosACanjear > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPuntosChange(0)}
                    className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    Quitar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPuntosChange(canje.saldo)}
                    className="shrink-0 rounded-xl bg-brand-600 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
                  >
                    Usar puntos
                  </button>
                )}
              </div>
              {puntosACanjear > 0 ? (
                <p className="mt-2 text-[12px] text-gray-500">
                  Se usan {puntosACanjear} puntos. Le quedan {canje.saldo - puntosACanjear}.
                </p>
              ) : null}
            </div>
          ) : null}

          {vuelto > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-gray-900 p-4 text-white"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                Vuelto
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums leading-none">{fmt(vuelto)}</p>
            </motion.div>
          ) : null}
        </div>

        {/* ── Operación ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="text-base font-semibold text-gray-900">¿Cómo paga?</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={18} strokeWidth={STROKE} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {/* Métodos */}
            <div className="grid grid-cols-3 gap-2.5">
              {pagos.map((pago) => {
                const brand = paymentBrand(pago);
                const activo = metodoPago === pago;
                return (
                  <button
                    key={pago}
                    type="button"
                    onClick={() => onMetodoPagoChange(pago)}
                    aria-pressed={activo}
                    title={brand.label}
                    className="flex h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl transition-all active:scale-[0.97]"
                    style={
                      activo
                        ? {
                            background: brand.soft,
                            color: brand.color,
                            boxShadow: `0 8px 20px ${brand.color}1C`,
                          }
                        : {
                            background: 'transparent',
                            color: brand.color,
                          }
                    }
                  >
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: activo ? '#FFFFFF' : brand.soft }}
                    >
                      <PaymentMark method={pago} active={activo} size={42} />
                    </span>
                    <span
                      className={`max-w-full truncate px-1 text-[11px] leading-none ${activo ? 'font-semibold' : 'font-medium text-gray-600'}`}
                    >
                      {brand.short}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Reparto del pago mixto */}
            {esMixto ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500">Repartir el cobro</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums ${splitCompleto ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                  >
                    {splitCompleto ? 'Completo' : `Faltan ${fmt(Math.abs(splitRemaining))}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SPLIT_METHODS.map((method) => {
                    const brand = paymentBrand(method);
                    const cargado = Number(splitPayments[method] || 0) > 0;
                    return (
                      <label key={method} className="block">
                        <span
                          className="mb-1 flex items-center gap-1 text-[10px] font-medium"
                          style={{ color: cargado ? brand.color : '#9CA3AF' }}
                        >
                          <PaymentMark method={method} size={12} />
                          <span className="truncate">{brand.short}</span>
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={splitPayments[method] || ''}
                          onChange={(event) => onSplitPaymentChange(method, event.target.value)}
                          placeholder="0"
                          className="h-11 w-full rounded-xl border bg-white px-2.5 text-sm font-semibold tabular-nums text-gray-900 outline-none transition"
                          style={{ borderColor: cargado ? brand.color : '#E9EBEF' }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Efectivo + teclado */}
            {mostrarTeclado ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-semibold text-gray-500">
                    {esMixto ? `Efectivo para cubrir ${fmt(splitCashTarget)}` : 'Con cuánto paga'}
                  </p>
                  {rapidos.length > 0 ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onEfectivoRecibidoChange(String(Math.round(objetivoEfectivo)))
                        }
                        className="rounded-lg bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Justo
                      </button>
                      {rapidos.map((monto) => (
                        <button
                          key={monto}
                          type="button"
                          onClick={() => onEfectivoRecibidoChange(String(monto))}
                          className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gray-600 transition hover:bg-gray-200"
                        >
                          {fmt(monto)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-2 flex h-16 items-center justify-end rounded-2xl bg-gray-50 px-5 text-4xl font-bold tabular-nums text-gray-900">
                  {recibido ? fmt(recibido) : <span className="text-gray-300">$0</span>}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TECLAS.map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => tecla(valor)}
                      className="flex h-12 items-center justify-center rounded-xl bg-gray-50 text-lg font-semibold tabular-nums text-gray-800 transition hover:bg-gray-100 active:scale-95"
                    >
                      {valor === 'back' ? (
                        <Delete size={18} strokeWidth={STROKE} aria-label="Borrar" />
                      ) : (
                        valor
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Pie */}
          <div className="border-t border-gray-100 px-6 py-4">
            {confirmDisabled && blockedReason ? (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
                {blockedReason}
              </p>
            ) : null}

            <label className="mb-3 flex cursor-pointer items-center gap-2 text-[12px] font-medium text-gray-500">
              <input
                type="checkbox"
                checked={imprimir}
                onChange={(event) => setImprimir(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-200"
              />
              Imprimir ticket al cobrar
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-14 rounded-2xl px-6 text-sm font-semibold text-gray-500 transition hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                ref={confirmarButtonRef}
                type="button"
                onClick={() => onConfirm(imprimir)}
                disabled={confirmDisabled || loading}
                style={
                  confirmDisabled || loading
                    ? { background: '#F1F2F4', color: '#9CA3AF' }
                    : { background: BRAND, color: '#FFFFFF' }
                }
                className="h-14 flex-1 rounded-2xl text-lg font-bold tracking-tight transition-all active:scale-[0.99] disabled:cursor-not-allowed"
              >
                {loading ? 'Cobrando…' : <span className="tabular-nums">Cobrar {fmt(total)}</span>}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
