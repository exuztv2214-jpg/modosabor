import { Armchair, Bike, ShoppingCart, Store, X } from 'lucide-react';
import { motion } from 'framer-motion';

import { BlockedHint, BRAND, fmt, STROKE } from './tpvUi.jsx';
import TpvCartList from './TpvCartList.jsx';
import TpvCustomerBlock from './TpvCustomerBlock.jsx';
import TpvUtilityBar from './TpvUtilityBar.jsx';

const DELIVERY_MODES = [
  { value: 'retiro', label: 'Retira', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Bike },
  { value: 'mesa', label: 'Mesa', icon: Armchair },
];

/**
 * Columna del pedido.
 *
 * Mide 320px y no más. Eso es posible porque el cobro se mudó a un modal:
 * acá sólo vive el pedido — a quién, qué, cuánto — y un botón que abre el
 * cobro. Cuando los métodos de pago, el efectivo recibido y el vuelto
 * estaban acá adentro, la columna necesitaba ser el doble de ancha y los
 * controles terminaban chicos igual.
 *
 * Orden fijo, de arriba a abajo:
 *   1. Cabecera roja con el estado del pedido
 *   2. Modo de entrega
 *   3. Cliente (se adapta a mesa / retiro / delivery)
 *   4. Utilidades (espera, notas, descuento, hora, última venta)
 *   5. Items — la única zona que crece
 *   6. Total y botón de cobrar — fijos abajo
 */
export default function TpvSidebar({
  cartItemsRef,
  cartMobileOpen,
  cajaAbierta,
  cliente,
  confirmDisabled,
  blockedReason,
  deliveryQuote,
  barriosConocidos = [],
  descuento,
  descuentoAplicado,
  descuentoTipo,
  envio,
  horaEntrega,
  items,
  lastAddedId,
  mesa,
  notas,
  onAbrirSelectorClientes,
  onCambiarCantidad,
  onCanjearRecompensa,
  onCerrarCartMobile,
  onClearCliente,
  onClearOrder,
  onAbrirCobro,
  onDescuentoChange,
  onDescuentoTipoChange,
  onHoraEntregaChange,
  programarHora,
  onToggleProgramarHora,
  onImprimirMesa,
  onNotasChange,
  onParkCurrent,
  onParkedLabelChange,
  onRestoreParked,
  parkedLabel,
  onDuplicateParked,
  onQuitarItem,
  onDescontarItem,
  onReprintLastSale,
  onRepeatLastSale,
  onRepeatClientePedido,
  onRepeatPedidoHistorico,
  onSeleccionarRider,
  onSetCliente,
  onSetMesa,
  onTipoEntregaChange,
  onUbicacionCliente,
  onPegarUbicacionCliente,
  parkedOrders,
  printingMesa,
  repartidoresActivos,
  repartidoresDisponibles,
  selectedRiderId,
  sharingLocation,
  subtotal,
  tipoEntrega,
  total,
  totalItems,
  onDeleteParked,
  lastSale,
  clienteResumen,
  onOpenPedidos,
  clientesDelDia,
  onQuickPickCliente,
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 flex w-full shrink-0 flex-col bg-white transition-transform duration-300 lg:static lg:z-auto lg:my-3 lg:mr-3 lg:w-[380px] lg:translate-x-0 lg:rounded-2xl xl:w-[400px] lg:shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${cartMobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/*
        Cabecera y botón de cobrar usan el color por estilo inline y no por
        clase de Tailwind. Motivo: si la config de Tailwind no se releyó
        (pasa al cambiar tailwind.config.js sin reiniciar el server), una
        clase inexistente deja el fondo transparente y el texto blanco se
        vuelve invisible. En cualquier otro lugar eso sería un detalle; en
        el botón de cobrar es que el TPV deja de poder vender.
      */}
      <div
        className="flex shrink-0 items-center gap-2 rounded-t-2xl px-4 py-3 text-white"
        style={{ background: BRAND }}
      >
        <ShoppingCart size={17} strokeWidth={STROKE} className="shrink-0" />
        <h2 className="text-sm font-semibold">Pedido</h2>
        {totalItems > 0 ? (
          <motion.span
            key={totalItems}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 14, stiffness: 420 }}
            className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          >
            {totalItems}
          </motion.span>
        ) : null}
        <button
          type="button"
          onClick={onClearOrder}
          disabled={items.length === 0}
          className="ml-auto text-[11px] font-medium text-white/70 transition hover:text-white disabled:opacity-0"
        >
          Vaciar
        </button>
        <button
          type="button"
          onClick={onCerrarCartMobile}
          aria-label="Cerrar"
          className="ml-1 text-white/80 lg:hidden"
        >
          <X size={18} strokeWidth={STROKE} />
        </button>
      </div>

      {/* ── Modo de entrega ── */}
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {DELIVERY_MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onTipoEntregaChange(value)}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] transition-all ${tipoEntrega === value ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={13} strokeWidth={STROKE} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cliente ── */}
      <div className="shrink-0 pb-2">
        <TpvCustomerBlock
          cliente={cliente}
          tipoEntrega={tipoEntrega}
          mesa={mesa}
          onSetMesa={onSetMesa}
          onImprimirMesa={onImprimirMesa}
          printingMesa={printingMesa}
          onSetCliente={onSetCliente}
          onClearCliente={onClearCliente}
          onAbrirSelectorClientes={onAbrirSelectorClientes}
          onCanjearRecompensa={onCanjearRecompensa}
          clienteResumen={clienteResumen}
          clientesDelDia={clientesDelDia}
          onQuickPickCliente={onQuickPickCliente}
          onRepeatClientePedido={onRepeatClientePedido}
          onRepeatPedidoHistorico={onRepeatPedidoHistorico}
          barriosConocidos={barriosConocidos}
          onUbicacionCliente={onUbicacionCliente}
          onPegarUbicacionCliente={onPegarUbicacionCliente}
          sharingLocation={sharingLocation}
          repartidoresActivos={repartidoresActivos}
          repartidoresDisponibles={repartidoresDisponibles}
          selectedRiderId={selectedRiderId}
          onSeleccionarRider={onSeleccionarRider}
        />
      </div>

      {/* ── Utilidades ── */}
      <div className="shrink-0 border-y border-gray-100 px-3 py-1.5">
        <TpvUtilityBar
          parkedOrders={parkedOrders}
          parkedLabel={parkedLabel}
          onParkedLabelChange={onParkedLabelChange}
          onParkCurrent={onParkCurrent}
          onRestoreParked={onRestoreParked}
          onDuplicateParked={onDuplicateParked}
          onDeleteParked={onDeleteParked}
          hasItems={items.length > 0}
          notas={notas}
          onNotasChange={onNotasChange}
          descuento={descuento}
          descuentoTipo={descuentoTipo}
          descuentoAplicado={descuentoAplicado}
          onDescuentoChange={onDescuentoChange}
          onDescuentoTipoChange={onDescuentoTipoChange}
          programarHora={programarHora}
          horaEntrega={horaEntrega}
          onToggleProgramarHora={onToggleProgramarHora}
          onHoraEntregaChange={onHoraEntregaChange}
          permiteHorario={tipoEntrega !== 'mesa'}
          lastSale={lastSale}
          onRepeatLastSale={onRepeatLastSale}
          onReprintLastSale={onReprintLastSale}
          onOpenPedidos={onOpenPedidos}
        />
      </div>

      {/* ── Items ── */}
      <div className="flex min-h-0 flex-1 flex-col py-2">
        <TpvCartList
          items={items}
          lastAddedId={lastAddedId}
          listRef={cartItemsRef}
          onCambiarCantidad={onCambiarCantidad}
          onQuitarItem={onQuitarItem}
          onDescontarItem={onDescontarItem}
        />
      </div>

      {/* ── Total y cobro ── */}
      <div className="shrink-0 rounded-b-2xl border-t border-gray-100 px-4 pb-4 pt-3">
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          {envio > 0 ? (
            <div className="flex justify-between text-gray-400">
              <span>Envío {deliveryQuote?.zone_name ? `· ${deliveryQuote.zone_name}` : ''}</span>
              <span className="tabular-nums">{fmt(envio)}</span>
            </div>
          ) : null}
          {descuentoAplicado > 0 ? (
            <div className="flex justify-between font-medium text-brand-600">
              <span>Descuento</span>
              <span className="tabular-nums">-{fmt(descuentoAplicado)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-baseline justify-between border-t border-dashed border-gray-200 pt-2.5">
          <span className="text-[13px] font-medium text-gray-500">Total</span>
          <motion.span
            key={total}
            initial={{ scale: 1.05 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 400 }}
            className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-gray-900"
          >
            {fmt(total)}
          </motion.span>
        </div>

        <div className="mt-3 flex">
          <BlockedHint reason={confirmDisabled ? blockedReason : null}>
            <button
              type="button"
              onClick={onAbrirCobro}
              disabled={confirmDisabled}
              style={
                confirmDisabled
                  ? { background: '#F1F2F4', color: '#9CA3AF' }
                  : { background: BRAND, color: '#FFFFFF' }
              }
              className="h-[52px] w-full rounded-xl text-[15px] font-semibold transition-all active:scale-[0.99] disabled:cursor-not-allowed"
            >
              {cajaAbierta ? 'Cobrar' : 'Abrir caja'}
            </button>
          </BlockedHint>
        </div>
      </div>
    </aside>
  );
}
