import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Armchair,
  Bike,
  Clock,
  DollarSign,
  KeyRound,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  Store,
  User,
  X,
} from 'lucide-react';

import api from '../../lib/api.js';
import { fmtMoney } from '../../lib/formatters.js';
import { BRAND, estadoTono, STROKE } from '../../lib/theme.js';
import { normalizePedidoItems } from '../../lib/pedidoItems.js';
import {
  normalizeMetodoPago,
  paymentMethodLabel,
  paymentStatusLabel,
} from '../../lib/paymentStatus.js';
import { fondoModal, useCerrarConEscape } from '../../hooks/useCerrarConEscape.js';
import { PRINT_LABELS, TIPO_LABELS } from './constants.js';

const ICONO_TIPO = {
  delivery: Bike,
  retiro: Store,
  mesa: Armchair,
};

function Fila({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] text-gray-600">
      <Icon size={15} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-400" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Detalle completo de un pedido.
 *
 * Resuelve tres agujeros del módulo anterior de una sola vez:
 *
 *  - Las notas del pedido eran un chip rojo que decía "Ver Notas" y no
 *    era clickeable. Avisaba que había algo importante sin dejarte leerlo.
 *  - No existía forma de abrir un pedido. Si un cliente llamaba por el
 *    #142, no había dónde mirar.
 *  - El log de impresiones tenía modal, función y prop conectada, pero
 *    ningún botón que lo disparara: noventa líneas inalcanzables.
 *
 * El historial de impresiones se pide recién al abrir el modal, no al
 * cargar el tablero: son cincuenta pedidos en pantalla y no tiene sentido
 * traer el log de todos por las dudas.
 */
const TIPOS_ENTREGA = [
  { value: 'retiro', label: 'Retira', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Bike },
  { value: 'mesa', label: 'Mesa', icon: Armchair },
];

export default function PedidoDetailModal({
  pedido,
  onClose,
  onPrint,
  canPrint,
  canEdit = false,
  canAssignRider = false,
  repartidores = [],
  guardando = false,
  onCambiarTipoEntrega,
  onAsignarRider,
}) {
  useCerrarConEscape(true, onClose);
  const [impresiones, setImpresiones] = useState([]);
  const [cargandoLog, setCargandoLog] = useState(false);

  useEffect(() => {
    if (!pedido?.id) return undefined;
    let cancelado = false;

    setCargandoLog(true);
    api
      .get(`/pedidos/${pedido.id}/impresiones`)
      .then((rows) => {
        if (!cancelado) setImpresiones(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelado) setImpresiones([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoLog(false);
      });

    return () => {
      cancelado = true;
    };
  }, [pedido?.id]);

  if (!pedido) return null;

  const items = normalizePedidoItems(pedido.items);
  const tono = estadoTono(pedido.estado);
  const IconoTipo = ICONO_TIPO[pedido.tipo_entrega] || Store;
  const metodo = normalizeMetodoPago(pedido.metodo_pago);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onClick={fondoModal(onClose)}
      role="presentation"
    >
      <div
        className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido ${pedido.numero}`}
      >
        {/* ── Cabecera ── */}
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                Pedido #{pedido.numero}
              </h2>
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: tono.bg, color: tono.fg }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tono.dot }} />
                {tono.label}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                <IconoTipo size={12} strokeWidth={STROKE} />
                {TIPO_LABELS[pedido.tipo_entrega] || pedido.tipo_entrega}
              </span>
            </div>
            {pedido.creado_en ? (
              <p className="mt-1 text-[12px] text-gray-400">
                Recibido el{' '}
                {format(
                  parseISO(String(pedido.creado_en).replace(' ', 'T')),
                  "dd/MM 'a las' HH:mm"
                )}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {/* ── Notas: primero, porque es lo que se puede pasar por alto ── */}
          {pedido.notas ? (
            <div
              className="mb-4 rounded-xl px-4 py-3"
              style={{ background: '#FEF2F2', border: `1px solid ${BRAND}22` }}
            >
              <p
                className="flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: BRAND }}
              >
                <MessageSquare size={13} strokeWidth={STROKE} />
                Notas del pedido
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-snug text-gray-800">
                {pedido.notas}
              </p>
            </div>
          ) : null}

          {pedido.estado === 'cancelado' && pedido.motivo_cancelacion ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-[11px] font-semibold text-rose-800">Motivo de cancelación</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-snug text-rose-950">
                {pedido.motivo_cancelacion}
              </p>
            </div>
          ) : null}

          {/* ── Cliente ── */}
          <div className="mb-4 space-y-2 rounded-xl bg-gray-50 px-4 py-3">
            <Fila icon={User}>
              <span className="font-medium text-gray-900">
                {pedido.cliente_nombre || 'Consumidor final'}
              </span>
            </Fila>
            {pedido.cliente_telefono ? (
              <Fila icon={Phone}>
                <span className="tabular-nums">{pedido.cliente_telefono}</span>
              </Fila>
            ) : null}
            {pedido.mesa ? <Fila icon={Armchair}>Mesa {pedido.mesa}</Fila> : null}
            {pedido.cliente_direccion ? (
              <Fila icon={MapPin}>{pedido.cliente_direccion}</Fila>
            ) : null}
            {pedido.hora_entrega ? (
              <Fila icon={Clock}>
                Entrega pactada a las{' '}
                <span className="font-medium text-gray-900">{pedido.hora_entrega}</span>
              </Fila>
            ) : null}
            {pedido.entrega_pin ? (
              <Fila icon={KeyRound}>
                PIN de entrega{' '}
                <span className="font-mono text-[13px] font-semibold tracking-[0.2em] text-gray-900">
                  {pedido.entrega_pin}
                </span>
              </Fila>
            ) : null}
          </div>

          {/* ── Forma de entrega y rider ── */}
          {canEdit || canAssignRider ? (
            <div className="mb-4 rounded-xl border border-gray-100 px-4 py-3">
              {canEdit ? (
                <>
                  <p className="mb-2 text-[11px] font-semibold text-gray-400">Forma de entrega</p>
                  <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
                    {TIPOS_ENTREGA.map(({ value, label, icon: Icon }) => {
                      const activo = pedido.tipo_entrega === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={guardando || activo}
                          onClick={() => onCambiarTipoEntrega?.(pedido, value)}
                          className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] transition ${activo ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50'}`}
                        >
                          <Icon size={13} strokeWidth={STROKE} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {pedido.tipo_entrega === 'delivery' && canAssignRider ? (
                <div className={canEdit ? 'mt-3' : ''}>
                  <p className="mb-2 text-[11px] font-semibold text-gray-400">Rider asignado</p>
                  <div className="flex gap-2">
                    <select
                      value={pedido.repartidor_id || ''}
                      disabled={guardando}
                      onChange={(event) => {
                        const valor = event.target.value;
                        if (valor) onAsignarRider?.(pedido, valor);
                      }}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 outline-none transition focus:border-gray-300 disabled:opacity-50"
                    >
                      <option value="">Sin asignar</option>
                      {repartidores.map((repartidor) => (
                        <option key={repartidor.id} value={repartidor.id}>
                          {repartidor.nombre}
                          {Number(repartidor.disponible) === 1 ? '' : ' (ocupado)'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => onAsignarRider?.(pedido, null)}
                      title="Dejar que el sistema elija el rider más conveniente"
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                    >
                      <Bike size={14} strokeWidth={STROKE} />
                      Automático
                    </button>
                  </div>
                  {pedido.repartidor_nombre ? (
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      Reasignar libera al rider anterior.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Items ── */}
          <p className="mb-2 text-[11px] font-semibold text-gray-400">
            {items.length} {items.length === 1 ? 'producto' : 'productos'}
          </p>
          <div className="mb-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {items.map((item, index) => {
              // `subtotal` viene de pedido_items; si el pedido es viejo y sólo
              // tiene el JSON embebido, lo reconstruimos. Si no hay ninguno de
              // los dos, no mostramos "$0" — es peor que no mostrar nada.
              const linea = Number(
                item.subtotal ?? Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
              );
              return (
                <div key={index} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-700">
                    {item.cantidad}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-gray-900">
                      {item.nombre}
                    </p>
                    {item.descripcion ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                        {item.descripcion}
                      </p>
                    ) : null}
                  </div>
                  {linea > 0 ? (
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-gray-700">
                      {fmtMoney(linea)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* ── Pago ── */}
          <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-gray-600">
              <DollarSign size={15} strokeWidth={STROKE} className="text-gray-400" />
              {paymentMethodLabel(metodo)} · {paymentStatusLabel(pedido.pago_estado)}
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Total</p>
              <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: BRAND }}>
                {fmtMoney(pedido.total)}
              </p>
            </div>
          </div>

          {/* ── Log de impresiones ── */}
          <p className="mb-2 text-[11px] font-semibold text-gray-400">Impresiones</p>
          {cargandoLog ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-50" />
          ) : impresiones.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-[12px] text-gray-400">
              Este pedido todavía no se imprimió.
            </p>
          ) : (
            <div className="space-y-1">
              {impresiones.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2.5"
                >
                  <Printer size={15} strokeWidth={STROKE} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-700">
                    {PRINT_LABELS[row.tipo] || 'Documento'}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                    {row.creado_en
                      ? format(parseISO(String(row.creado_en).replace(' ', 'T')), 'dd/MM HH:mm')
                      : ''}
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${row.estado === 'impreso' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {row.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pie ── */}
        {canPrint ? (
          <div className="flex shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => onPrint(pedido.id, 'comanda_cocina')}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <Printer size={15} strokeWidth={STROKE} />
              Comanda
            </button>
            <button
              type="button"
              onClick={() => onPrint(pedido.id, 'ticket_cliente')}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <Printer size={15} strokeWidth={STROKE} />
              Ticket
            </button>
            {pedido.tipo_entrega === 'delivery' ? (
              <button
                type="button"
                onClick={() => onPrint(pedido.id, 'delivery_ticket')}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                <Printer size={15} strokeWidth={STROKE} />
                Hoja delivery
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
