import { format, parseISO } from 'date-fns';
import {
  Armchair,
  Bike,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  MessageSquare,
  Printer,
  RefreshCw,
  Store,
  X,
} from 'lucide-react';

import { fmtMoney } from '../../lib/formatters.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import { normalizePedidoItems } from '../../lib/pedidoItems.js';
import { isPagoPagado, normalizeMetodoPago, paymentMethodLabel } from '../../lib/paymentStatus.js';
import { fmtElapsed, minutesElapsed, TIPO_LABELS, umbralDemora } from './constants.js';

const ICONO_TIPO = { delivery: Bike, retiro: Store, mesa: Armchair };

/** Cuántos items se muestran en la tarjeta antes de resumir el resto. */
const ITEMS_VISIBLES = 3;

export default function PedidoCard({
  pedido,
  onEstado,
  onPrint,
  onOpen,
  onSyncPayment,
  onUpdatePayment,
  syncingPaymentKey,
  canPrint,
  canChangeState,
  resolveNextState,
  resolveNextLabel,
  canCancel,
  canManagePayment,
}) {
  const items = normalizePedidoItems(pedido.items);
  const nextState = resolveNextState(pedido);
  const nextLabel = nextState ? resolveNextLabel(pedido, nextState) : '';
  const syncingPayment = syncingPaymentKey === pedido.id;
  const pagoMetodo = normalizeMetodoPago(pedido.metodo_pago);
  const pagoCobrado = isPagoPagado(pedido.pago_estado);
  const elapsedMin = minutesElapsed(pedido.actualizado_en || pedido.creado_en);
  const elapsedLabel = fmtElapsed(elapsedMin);
  const demorado = elapsedMin !== null && elapsedMin >= umbralDemora(pedido.tipo_entrega);
  const IconoTipo = ICONO_TIPO[pedido.tipo_entrega] || Store;
  const ocultos = Math.max(0, items.length - ITEMS_VISIBLES);

  // Los clicks en botones no deben abrir el detalle.
  const stop = (event) => event.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(pedido)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(pedido);
        }
      }}
      className="group relative cursor-pointer rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-shadow duration-200 hover:shadow-[0_6px_20px_rgba(15,23,42,0.09)]"
    >
      {/* ── Cabecera ── */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[15px] font-semibold tracking-tight text-gray-900">
          #{pedido.numero}
        </span>
        <span className="flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
          <IconoTipo size={11} strokeWidth={STROKE} />
          {TIPO_LABELS[pedido.tipo_entrega] || pedido.tipo_entrega}
        </span>
        {pedido.creado_en ? (
          <span className="text-[11px] tabular-nums text-gray-400">
            {format(parseISO(String(pedido.creado_en).replace(' ', 'T')), 'HH:mm')}
          </span>
        ) : null}
        {elapsedLabel ? (
          <span
            className={`ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${demorado ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
            style={demorado ? { background: BRAND } : undefined}
            title={demorado ? 'Este pedido está demorado' : 'Tiempo desde el último cambio'}
          >
            <Clock size={10} strokeWidth={STROKE} />
            {elapsedLabel}
          </span>
        ) : null}
      </div>

      {/* ── Cliente ── */}
      <p className="truncate text-[14px] font-semibold text-gray-900">
        {pedido.cliente_nombre || 'Consumidor final'}
      </p>
      {pedido.mesa ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
          <Armchair size={12} strokeWidth={STROKE} />
          Mesa {pedido.mesa}
        </p>
      ) : null}
      {pedido.tipo_entrega === 'delivery' && pedido.cliente_direccion ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
          <MapPin size={12} strokeWidth={STROKE} className="shrink-0" />
          <span className="truncate">{pedido.cliente_direccion}</span>
        </p>
      ) : null}
      {pedido.tipo_entrega === 'delivery' ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Bike size={12} strokeWidth={STROKE} className="shrink-0" />
          {pedido.repartidor_nombre ? (
            <span className="truncate">{pedido.repartidor_nombre}</span>
          ) : (
            <span className="text-amber-600">Sin rider asignado</span>
          )}
        </p>
      ) : null}

      {/* ── Items ── */}
      <div className="mt-3 space-y-1">
        {items.slice(0, ITEMS_VISIBLES).map((item, index) => (
          <p key={index} className="flex gap-1.5 text-[12px] leading-snug text-gray-600">
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">
              {item.cantidad}×
            </span>
            <span className="min-w-0 truncate">{item.nombre}</span>
          </p>
        ))}
        {ocultos > 0 ? (
          <p className="text-[11px] text-gray-400">
            y {ocultos} {ocultos === 1 ? 'producto más' : 'productos más'}
          </p>
        ) : null}
      </div>

      {/* ── Chips ── */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${pagoCobrado ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
        >
          <DollarSign size={10} strokeWidth={STROKE} />
          {paymentMethodLabel(pagoMetodo)} · {pagoCobrado ? 'cobrado' : 'a cobrar'}
        </span>
        {pedido.hora_entrega ? (
          <span className="flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
            <Clock size={10} strokeWidth={STROKE} />
            {pedido.hora_entrega}
          </span>
        ) : null}
        {pedido.notas ? (
          // Antes esto decía "Ver Notas" y no era clickeable. Ahora abre el
          // detalle, que muestra el texto completo arriba de todo.
          <button
            type="button"
            onClick={(event) => {
              stop(event);
              onOpen(pedido);
            }}
            title={pedido.notas}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition hover:brightness-95"
            style={{ background: '#FEF2F2', color: BRAND }}
          >
            <MessageSquare size={10} strokeWidth={STROKE} />
            Con notas
          </button>
        ) : null}
      </div>

      {/* ── Total y acciones ── */}
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[10px] text-gray-400">Total</p>
          <p className="text-[17px] font-bold leading-tight tabular-nums text-gray-900">
            {fmtMoney(pedido.total)}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5" onClick={stop} role="presentation">
          {canManagePayment && !pagoCobrado && pagoMetodo !== 'mercadopago' ? (
            <button
              type="button"
              onClick={() => onUpdatePayment(pedido.id, 'pagado')}
              disabled={syncingPayment}
              title="Marcar como cobrado"
              aria-label="Marcar como cobrado"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <DollarSign size={15} strokeWidth={STROKE} />
            </button>
          ) : null}
          {pagoMetodo === 'mercadopago' && !pagoCobrado ? (
            <button
              type="button"
              onClick={() => onSyncPayment(pedido.id)}
              disabled={syncingPayment}
              title="Revisar el pago en Mercado Pago"
              aria-label="Revisar el pago en Mercado Pago"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                strokeWidth={STROKE}
                className={syncingPayment ? 'animate-spin' : ''}
              />
            </button>
          ) : null}
          {canPrint ? (
            <button
              type="button"
              onClick={() => onPrint(pedido.id, 'ticket_cliente')}
              title="Imprimir ticket"
              aria-label="Imprimir ticket"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
            >
              <Printer size={15} strokeWidth={STROKE} />
            </button>
          ) : null}
          {nextState && canChangeState(nextState) ? (
            <button
              type="button"
              onClick={() => onEstado(pedido.id, nextState)}
              style={
                nextState === 'entregado'
                  ? { background: '#059669', color: '#FFFFFF' }
                  : { background: BRAND, color: '#FFFFFF' }
              }
              className="flex h-9 items-center gap-1 rounded-lg px-3 text-[12px] font-semibold capitalize transition-transform active:scale-95"
            >
              {nextLabel}
              <ChevronRight size={13} strokeWidth={STROKE} />
            </button>
          ) : null}
        </div>
      </div>

      {canCancel ? (
        <button
          type="button"
          onClick={(event) => {
            stop(event);
            onEstado(pedido.id, 'cancelado');
          }}
          title="Cancelar pedido"
          aria-label="Cancelar pedido"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 focus:opacity-100 group-hover:opacity-100"
        >
          <X size={14} strokeWidth={STROKE} />
        </button>
      ) : null}
    </div>
  );
}
